// Codex driver: supervised `codex app-server` threads. Sessions are codex
// thread ids; fork and rewind both ride on thread/fork {lastTurnId}
// (probe-verified), so turn ids double as fork/rewind anchors.

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type {
  ConversationMode,
  ElicitationSchema,
  PermissionOptionKind,
  SessionConfigDTO,
  SessionConfigOption,
  StopReason,
  ToolContentView,
  ToolStatus,
  TurnTokens,
} from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/kepler";
import { statOrNull } from "$lib/server/files";
import { getConversationRoot } from "$lib/server/paths";
import { askElicitation, askPermission } from "../../core/requests";
import { VISUAL_FRAGMENT_GUIDANCE } from "../../core/prompts";
import {
  applyStoredValues,
  cachedSessionConfig,
  createSessionEstablisher,
  dropCachedSessionConfig,
  optionLabel,
  persistChosenOption,
  setCachedSessionConfig,
  STALE_MODEL,
  storedOptions,
} from "../../core/session-config-store";
import type {
  ConversationRow,
  EngineDriver,
  ToolPartUpdate,
  TurnInput,
  TurnSink,
} from "../../types";
import {
  appServerRunning,
  ensureAppServer,
  onAppServerExit,
  onNotification,
  onServerRequest,
  request,
  stopAppServer,
} from "./app-server";
import type {
  AgentMessageDeltaNotification,
  CommandExecutionApprovalDecision,
  CommandExecutionOutputDeltaNotification,
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  ErrorNotification,
  FileChangeApprovalDecision,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
  ItemStartedNotification,
  McpServerElicitationRequestParams,
  McpServerElicitationRequestResponse,
  Model,
  ModelListResponse,
  ReasoningSummaryTextDeltaNotification,
  ThreadForkResponse,
  ThreadItem,
  ThreadStartResponse,
  ThreadTokenUsage,
  ThreadTokenUsageUpdatedNotification,
  ToolRequestUserInputParams,
  ToolRequestUserInputResponse,
  TurnCompletedNotification,
  TurnPlanUpdatedNotification,
  TurnStartParams,
  TurnStartResponse,
  UserInput,
} from "./protocol/v2";

const EMBED_TEXT_LIMIT = 262144;
const INTERRUPT_GRACE_MS = 10000;
/** The decisions both approval kinds accept; `satisfies` turns protocol drift into a build error. */
type ApprovalDecision = Extract<CommandExecutionApprovalDecision, string> & FileChangeApprovalDecision;

const APPROVAL_OPTIONS = [
  { optionId: "accept", name: "Allow", kind: "allow_once" },
  { optionId: "acceptForSession", name: "Always allow", kind: "allow_always" },
  { optionId: "decline", name: "Reject", kind: "reject_once" },
] satisfies Array<{ optionId: ApprovalDecision; name: string; kind: PermissionOptionKind }>;

interface ActiveTurn {
  conv: ConversationRow;
  sink: TurnSink;
  turnId: string | null;
  queue: Promise<void>;
  outputs: Map<string, string>;
  items: Map<string, ThreadItem>;
  lastUsage: ThreadTokenUsage | null;
  errorMessage: string | null;
  finish: (status: "completed" | "interrupted") => void;
  fail: (error: Error) => void;
}

const resumedEpochByThread = new Map<string, number>();
const activeTurns = new Map<string, ActiveTurn>();
let modelsPromise: Promise<Model[]> | null = null;
let versionCache: string | null | undefined;

function codexBin(): string {
  return process.env.KEPLER_CODEX_BIN ?? "codex";
}

function codexVersion(): string | null {
  if (versionCache === undefined) {
    const result = spawnSync(codexBin(), ["--version"], { encoding: "utf8" });
    // `codex --version` prints "codex-cli 0.145.0"; callers want the number.
    versionCache = result.status === 0 ? (result.stdout.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? null) : null;
  }
  return versionCache;
}

function loadModels(): Promise<Model[]> {
  modelsPromise ??= (async () => {
    const models: Model[] = [];
    let cursor: string | null = null;
    do {
      const page: ModelListResponse = await request("model/list", cursor ? { cursor } : {});
      models.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    return models;
  })().catch((error) => {
    modelsPromise = null;
    throw error;
  });
  return modelsPromise;
}

function synthesizeConfig(models: Model[], stored: Record<string, string>): SessionConfigDTO {
  const listed = models.filter((model) => !model.hidden);
  const current =
    listed.find((model) => model.id === stored.model) ??
    (stored.model ? null : (listed.find((model) => model.isDefault) ?? listed[0]));
  const efforts = current?.supportedReasoningEfforts ?? [];
  const options: SessionConfigOption[] = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: current?.id ?? stored.model ?? "",
      options: [
        ...listed.map((model) => ({
          value: model.id,
          name: model.displayName,
          description: model.description || null,
        })),
        ...(current ? [] : [{ value: stored.model, name: stored.model, description: STALE_MODEL }]),
      ],
    },
  ];
  if (efforts.length > 0) {
    options.push({
      id: "effort",
      name: "Reasoning effort",
      type: "select",
      currentValue: efforts.some((option) => option.reasoningEffort === stored.effort)
        ? stored.effort
        : (current?.defaultReasoningEffort ?? ""),
      options: efforts.map((option) => ({
        value: option.reasoningEffort,
        name: optionLabel(option.reasoningEffort),
        description: option.description || null,
      })),
    });
  }
  return {
    configOptions: applyStoredValues(options, stored),
    capabilities: {
      fork: true,
      forkAtMessage: true,
      editMessage: true,
      regenerate: true,
      compact: true,
    },
  };
}

async function establishThread(conv: ConversationRow): Promise<string> {
  const epoch = await ensureAppServer();
  const existing = conv.engine_session_id;
  if (existing) {
    if (resumedEpochByThread.get(existing) !== epoch) {
      await request("thread/resume", { threadId: existing, cwd: getConversationRoot(conv) });
      resumedEpochByThread.set(existing, epoch);
    }
    return existing;
  }
  const started: ThreadStartResponse = await request("thread/start", {
    cwd: getConversationRoot(conv),
    ...(conv.mode === "chat"
      ? { developerInstructions: `You are in conversational chat mode.\n${VISUAL_FRAGMENT_GUIDANCE}` }
      : {}),
  });
  const threadId = started.thread.id;
  resumedEpochByThread.set(threadId, epoch);
  await db
    .update(conversation)
    .set({ engine_session_id: threadId })
    .where(eq(conversation.id, conv.id));
  conv.engine_session_id = threadId;
  return threadId;
}

async function buildInput(input: TurnInput, mode: ConversationMode): Promise<UserInput[]> {
  const items: UserInput[] = [];
  if (input.text) items.push({ type: "text", text: input.text, text_elements: [] });
  for (const attachment of input.attachments) {
    if (attachment.mimeType.startsWith("image/")) {
      items.push({ type: "localImage", path: attachment.absolutePath });
      continue;
    }
    const stats = await statOrNull(attachment.absolutePath);
    const isTextLike =
      attachment.mimeType.startsWith("text/") ||
      attachment.mimeType === "application/json" ||
      attachment.mimeType === "application/octet-stream";
    if (isTextLike && stats && stats.size <= EMBED_TEXT_LIMIT) {
      const content = await readFile(attachment.absolutePath, "utf8");
      if (!content.includes("\0")) {
        items.push({
          type: "text",
          text: `Attached file ${attachment.filename}:\n\n${content}`,
          text_elements: [],
        });
        continue;
      }
    }
    items.push({
      type: "text",
      text:
        mode === "work"
          ? `Attached file at ./input/${attachment.relativePath}`
          : `Attachment ${attachment.filename} could not be inlined (unsupported type).`,
      text_elements: [],
    });
  }
  return items;
}

function mapItemStatus(status: "inProgress" | "completed" | "failed" | "declined"): ToolStatus {
  if (status === "inProgress") return "in_progress";
  return status === "completed" ? "completed" : "failed";
}

function toolUpdateFor(
  item: ThreadItem,
  phase: "started" | "completed",
  outputs: Map<string, string>,
): ToolPartUpdate | null {
  switch (item.type) {
    case "commandExecution":
      return {
        toolCallId: item.id,
        title: item.command,
        kind: "execute",
        status: mapItemStatus(item.status),
        rawInput: { command: item.command, cwd: item.cwd },
        ...(phase === "completed"
          ? {
              rawOutput: { exitCode: item.exitCode, aggregatedOutput: item.aggregatedOutput },
              content: [
                { type: "text", text: item.aggregatedOutput ?? outputs.get(item.id) ?? "" },
              ],
            }
          : {}),
      };
    case "fileChange":
      return {
        toolCallId: item.id,
        title: item.changes.map((change) => change.path).join(", "),
        kind: "edit",
        status: mapItemStatus(item.status),
        rawInput: item.changes,
        content: item.changes.map((change) => ({
          type: "diff",
          path: change.path,
          oldText: null,
          newText: change.diff,
        })),
      };
    case "webSearch":
      return {
        toolCallId: item.id,
        title: item.query,
        kind: "fetch",
        status: phase === "completed" ? "completed" : "in_progress",
        rawInput: item.action ?? { query: item.query },
        ...(phase === "completed" ? { rawOutput: item.results } : {}),
      };
    case "mcpToolCall": {
      const resultText: ToolContentView[] = [];
      if (item.error) {
        resultText.push({ type: "text", text: item.error.message });
      } else if (item.result) {
        for (const block of item.result.content) {
          const view = block as { type?: string; text?: string };
          if (view.type === "text" && view.text) resultText.push({ type: "text", text: view.text });
        }
      }
      return {
        toolCallId: item.id,
        title: `${item.server}.${item.tool}`,
        kind: "other",
        status: mapItemStatus(item.status),
        rawInput: item.arguments,
        ...(phase === "completed"
          ? { rawOutput: item.result ?? item.error, content: resultText }
          : {}),
      };
    }
    case "userMessage":
    case "agentMessage":
    case "reasoning":
    case "plan":
      return null;
    default:
      return {
        toolCallId: item.id,
        title: item.type,
        kind: "other",
        status: phase === "completed" ? "completed" : "in_progress",
      };
  }
}

function enqueue(turn: ActiveTurn, task: () => Promise<void> | void): void {
  turn.queue = turn.queue.then(task).catch((error) => turn.fail(error as Error));
}

function handleNotification(method: string, params: unknown): void {
  const threadId = (params as { threadId?: string }).threadId;
  const turn = threadId ? activeTurns.get(threadId) : undefined;
  if (!turn) return;
  switch (method) {
    case "item/agentMessage/delta": {
      const { delta } = params as AgentMessageDeltaNotification;
      enqueue(turn, () => turn.sink.appendText("text", delta));
      return;
    }
    case "item/reasoning/summaryTextDelta": {
      const { delta } = params as ReasoningSummaryTextDeltaNotification;
      enqueue(turn, () => turn.sink.appendText("reasoning", delta));
      return;
    }
    case "item/started":
    case "item/completed": {
      const { item } = params as ItemStartedNotification;
      turn.items.set(item.id, item);
      const update = toolUpdateFor(item, method === "item/started" ? "started" : "completed", turn.outputs);
      if (update) enqueue(turn, () => turn.sink.upsertToolCall(update));
      return;
    }
    case "item/commandExecution/outputDelta": {
      const { itemId, delta } = params as CommandExecutionOutputDeltaNotification;
      const text = (turn.outputs.get(itemId) ?? "") + delta;
      turn.outputs.set(itemId, text);
      enqueue(turn, () =>
        turn.sink.upsertToolCall({ toolCallId: itemId, content: [{ type: "text", text }] }),
      );
      return;
    }
    case "turn/plan/updated": {
      const { plan } = params as TurnPlanUpdatedNotification;
      turn.sink.emit("plan", {
        entries: plan.map((step) => ({
          content: step.step,
          priority: "medium",
          status: step.status === "inProgress" ? "in_progress" : step.status,
        })),
      });
      return;
    }
    case "thread/tokenUsage/updated": {
      const { tokenUsage } = params as ThreadTokenUsageUpdatedNotification;
      turn.lastUsage = tokenUsage;
      if (tokenUsage.modelContextWindow) {
        turn.sink.emit("usage", {
          used: tokenUsage.last.inputTokens + tokenUsage.last.outputTokens,
          size: tokenUsage.modelContextWindow,
          cost: null,
        });
      }
      return;
    }
    case "error": {
      const { error, willRetry } = params as ErrorNotification;
      if (!willRetry) turn.errorMessage = error.message;
      return;
    }
    case "turn/completed": {
      const { turn: completed } = params as TurnCompletedNotification;
      enqueue(turn, () => {
        if (completed.status === "failed") {
          turn.fail(new Error(completed.error?.message ?? turn.errorMessage ?? "Codex turn failed"));
        } else {
          turn.finish(completed.status === "interrupted" ? "interrupted" : "completed");
        }
      });
      return;
    }
  }
}

async function approveCommand(
  params: CommandExecutionRequestApprovalParams,
): Promise<CommandExecutionRequestApprovalResponse> {
  const turn = activeTurns.get(params.threadId);
  if (!turn) return { decision: "cancel" };
  const reply = await askPermission(turn.conv.id, {
    title: params.command ?? "Run command",
    toolKind: "execute",
    rawInput: params,
    locations: [],
    options: APPROVAL_OPTIONS,
  });
  if (reply.outcome !== "selected") return { decision: "cancel" };
  return { decision: reply.optionId as ApprovalDecision };
}

async function approveFileChange(
  params: FileChangeRequestApprovalParams,
): Promise<FileChangeRequestApprovalResponse> {
  const turn = activeTurns.get(params.threadId);
  if (!turn) return { decision: "cancel" };
  const item = turn.items.get(params.itemId);
  const title =
    item?.type === "fileChange"
      ? item.changes.map((change) => change.path).join(", ")
      : (params.reason ?? "Apply file changes");
  const reply = await askPermission(turn.conv.id, {
    title,
    toolKind: "edit",
    rawInput: params,
    locations: [],
    options: APPROVAL_OPTIONS,
  });
  if (reply.outcome !== "selected") return { decision: "cancel" };
  return { decision: reply.optionId as ApprovalDecision };
}

async function answerUserInput(
  params: ToolRequestUserInputParams,
): Promise<ToolRequestUserInputResponse> {
  const turn = activeTurns.get(params.threadId);
  if (!turn) return { answers: {} };
  const schema: ElicitationSchema = {
    type: "object",
    title: params.questions[0]?.header,
    properties: Object.fromEntries(
      params.questions.map((question) => [
        question.id,
        {
          type: "string" as const,
          title: question.header,
          description: question.question,
          ...(question.options
            ? {
                oneOf: question.options.map((option) => ({
                  const: option.label,
                  title: option.label,
                  description: option.description,
                })),
              }
            : {}),
        },
      ]),
    ),
    required: params.questions.map((question) => question.id),
  };
  const reply = await askElicitation(turn.conv.id, {
    message: params.questions.map((question) => question.question).join("\n"),
    requestedSchema: schema,
  });
  if (reply.action !== "accept") return { answers: {} };
  return {
    answers: Object.fromEntries(
      params.questions.map((question) => [
        question.id,
        { answers: [String(reply.content[question.id] ?? "")] },
      ]),
    ),
  };
}

async function answerMcpElicitation(
  params: McpServerElicitationRequestParams,
): Promise<McpServerElicitationRequestResponse> {
  const turn = activeTurns.get(params.threadId);
  if (!turn) return { action: "cancel", content: null, _meta: null };
  const reply = await askElicitation(turn.conv.id, {
    message: params.message,
    requestedSchema:
      params.mode === "url" ? {} : (params.requestedSchema as unknown as ElicitationSchema),
  });
  if (reply.action !== "accept") return { action: reply.action, content: null, _meta: null };
  return {
    action: "accept",
    content: reply.content as McpServerElicitationRequestResponse["content"],
    _meta: null,
  };
}

async function handleServerRequest(method: string, params: unknown): Promise<unknown> {
  switch (method) {
    case "item/commandExecution/requestApproval":
      return approveCommand(params as CommandExecutionRequestApprovalParams);
    case "item/fileChange/requestApproval":
      return approveFileChange(params as FileChangeRequestApprovalParams);
    case "item/tool/requestUserInput":
      return answerUserInput(params as ToolRequestUserInputParams);
    case "mcpServer/elicitation/request":
      return answerMcpElicitation(params as McpServerElicitationRequestParams);
    default:
      throw new Error(`Unhandled server request: ${method}`);
  }
}

export function createCodexDriver(): EngineDriver {
  onNotification(handleNotification);
  onServerRequest(handleServerRequest);
  onAppServerExit(() => {
    for (const turn of activeTurns.values()) {
      turn.fail(new Error("Codex app-server exited mid-turn"));
    }
  });

  return {
    id: "codex",
    name: "Codex",
    capabilities: {
      chatMode: true,
      fork: true,
      forkAtMessage: true,
      editMessage: true,
      regenerate: true,
      revertInPlace: false,
      modelCatalog: true,
      mcpStatus: false,
      compact: true,
      commands: false,
    },

    ensureSession: createSessionEstablisher(async (conv) => {
      await establishThread(conv);
      const config = synthesizeConfig(await loadModels(), storedOptions(conv));
      return setCachedSessionConfig(conv.id, config);
    }),

    async deleteSession(conv) {
      dropCachedSessionConfig(conv.id);
      const threadId = conv.engine_session_id;
      if (!threadId) return;
      resumedEpochByThread.delete(threadId);
      await request("thread/delete", { threadId }).catch(() => {});
    },

    async forkSession(source, target, atEngineMessageId) {
      if (!source.engine_session_id) {
        throw new Error("Source conversation has no session to fork");
      }
      const epoch = await ensureAppServer();
      const forked: ThreadForkResponse = await request("thread/fork", {
        threadId: source.engine_session_id,
        ...(atEngineMessageId ? { lastTurnId: atEngineMessageId } : {}),
        cwd: getConversationRoot(target),
      });
      resumedEpochByThread.set(forked.thread.id, epoch);
      return { engineSessionId: forked.thread.id, forkPending: null };
    },

    async rewindTo(conv, atEngineMessageId) {
      const previous = conv.engine_session_id;
      if (!previous) return;
      let next: string | null = null;
      if (atEngineMessageId) {
        const epoch = await ensureAppServer();
        const forked: ThreadForkResponse = await request("thread/fork", {
          threadId: previous,
          lastTurnId: atEngineMessageId,
          cwd: getConversationRoot(conv),
        });
        next = forked.thread.id;
        resumedEpochByThread.set(next, epoch);
      }
      await db
        .update(conversation)
        .set({ engine_session_id: next })
        .where(eq(conversation.id, conv.id));
      conv.engine_session_id = next;
      resumedEpochByThread.delete(previous);
      await request("thread/delete", { threadId: previous }).catch(() => {});
    },

    async runTurn(conv, input, sink, signal) {
      const stored = storedOptions(conv);
      const threadId = await establishThread(conv);
      const turnInput = await buildInput(input, conv.mode);

      const active: ActiveTurn = {
        conv,
        sink,
        turnId: null,
        queue: Promise.resolve(),
        outputs: new Map(),
        items: new Map(),
        lastUsage: null,
        errorMessage: null,
        finish: () => {},
        fail: () => {},
      };
      const completion = new Promise<"completed" | "interrupted">((resolve, reject) => {
        active.finish = resolve;
        active.fail = reject;
      });
      activeTurns.set(threadId, active);

      let abortTimer: ReturnType<typeof setTimeout> | null = null;
      const onAbort = () => {
        if (active.turnId) {
          void request("turn/interrupt", { threadId, turnId: active.turnId }).catch(() => {});
        }
        abortTimer = setTimeout(() => active.finish("interrupted"), INTERRUPT_GRACE_MS);
      };

      let stopReason: StopReason = "end_turn";
      try {
        const params: TurnStartParams = {
          threadId,
          input: turnInput,
          cwd: getConversationRoot(conv),
          ...(stored.model ? { model: stored.model } : {}),
          ...(stored.effort ? { effort: stored.effort } : {}),
          ...(conv.mode === "chat"
            ? {
                sandboxPolicy: { type: "readOnly", networkAccess: true },
                approvalPolicy: "never" as const,
              }
            : {
                sandboxPolicy: {
                  type: "workspaceWrite",
                  writableRoots: [],
                  networkAccess: true,
                  excludeTmpdirEnvVar: false,
                  excludeSlashTmp: false,
                },
                approvalPolicy: "on-request" as const,
              }),
        };
        const started: TurnStartResponse = await request("turn/start", params);
        active.turnId = started.turn.id;
        sink.setEngineMessageId(started.turn.id);

        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });

        const status = await completion;
        await active.queue;
        if (status === "interrupted" || signal.aborted) stopReason = "cancelled";
      } catch (error) {
        if (!signal.aborted) throw error;
        stopReason = "cancelled";
      } finally {
        signal.removeEventListener("abort", onAbort);
        if (abortTimer) clearTimeout(abortTimer);
        activeTurns.delete(threadId);
      }

      let tokens: TurnTokens | null = null;
      let context: { used: number; size: number } | null = null;
      const usage = active.lastUsage;
      if (usage) {
        const last = usage.last;
        tokens = {
          input: last.inputTokens,
          output: last.outputTokens,
          thought: last.reasoningOutputTokens || undefined,
          cacheRead: last.cachedInputTokens || undefined,
          cacheWrite: last.cacheWriteInputTokens || undefined,
          total: last.totalTokens,
        };
        if (usage.modelContextWindow) {
          context = {
            used: last.inputTokens + last.outputTokens,
            size: usage.modelContextWindow,
          };
        }
      }

      return {
        stopReason,
        tokens,
        cumulativeTokens: false,
        costUsd: null,
        context,
        title: null,
      };
    },

    async agentConfig(_mode, modelValue) {
      return synthesizeConfig(await loadModels(), modelValue ? { model: modelValue } : {});
    },

    sessionConfigFor(conversationId) {
      return cachedSessionConfig(conversationId);
    },

    async setConfigOption(conv, configId, value) {
      if (typeof value !== "string" || !["model", "effort"].includes(configId)) {
        throw new Error(`Unknown config option: ${configId}`);
      }
      await persistChosenOption(conv, configId, value);
      const config = synthesizeConfig(await loadModels(), storedOptions(conv));
      return setCachedSessionConfig(conv.id, config);
    },

    async listCommands() {
      return [];
    },

    async status() {
      const version = codexVersion();
      return {
        available: version !== null,
        running: appServerRunning(),
        version,
        authHint: "Sign in with `codex login` (ChatGPT account).",
      };
    },

    async stop() {
      await stopAppServer();
    },
  };
}
