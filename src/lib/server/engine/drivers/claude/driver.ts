// Claude driver: in-process @anthropic-ai/claude-agent-sdk. Sessions are the
// SDK's transcript files keyed by encoded cwd; forks ride on the next prompt
// via resume+forkSession+resumeSessionAt (probe-verified, incl. cross-cwd
// with the transcript copied into the target cwd's project dir).

import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  CanUseTool,
  McpServerConfig,
  Options,
  PermissionUpdate,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources";
import type {
  AgentCommand,
  ConversationMode,
  ElicitationSchema,
  SessionConfigDTO,
  SessionConfigOption,
  StopReason,
  ToolContentView,
  ToolKind,
  TurnTokens,
} from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/kepler";
import { getConversationRoot } from "$lib/server/paths";
import { resolveMcpServers } from "$lib/server/mcp";
import { statOrNull } from "$lib/server/files";
import { askElicitation, askPermission } from "../../core/requests";
import { loadAgentEnv } from "../../core/env-profiles";
import {
  applyStoredValues,
  cachedSessionConfig,
  dropCachedSessionConfig,
  persistChosenOption,
  setCachedSessionConfig,
  storedOptions,
} from "../../core/session-config-store";
import type {
  ConversationRow,
  EngineDriver,
  ResolvedAttachment,
  TurnInput,
  TurnResult,
  TurnSink,
} from "../../types";
import { CHAT_SYSTEM_PROMPT } from "./prompts";

const EMBED_TEXT_LIMIT = 262144;

const MODEL_VALUES = ["default", "opus", "sonnet", "haiku"];
const EFFORT_VALUES = ["low", "medium", "high", "xhigh", "max"] as const;
type EffortValue = (typeof EFFORT_VALUES)[number];

/** Read is scoped by permissions to the conversation root; Skill needs it. */
const CHAT_TOOLS = ["WebSearch", "WebFetch", "Skill", "Read"];

interface ForkPending {
  sessionId: string;
  anchor?: string;
}

const commandsByConversation = new Map<string, AgentCommand[]>();
const alwaysAllowed = new Map<string, Set<string>>();

const sdkVersion: string = (() => {
  try {
    const require = createRequire(import.meta.url);
    return require("@anthropic-ai/claude-agent-sdk/package.json").version as string;
  } catch {
    return "unknown";
  }
})();

const encodeCwd = (cwd: string): string => cwd.replaceAll("/", "-");
const projectDir = (cwd: string): string =>
  join(homedir(), ".claude", "projects", encodeCwd(cwd));

function synthesizeConfig(stored: Record<string, string>): SessionConfigDTO {
  const options: SessionConfigOption[] = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: stored.model ?? "default",
      options: MODEL_VALUES.map((value) => ({
        value,
        name: value === "default" ? "Default" : value[0].toUpperCase() + value.slice(1),
      })),
    },
    {
      id: "effort",
      name: "Reasoning effort",
      type: "select",
      currentValue: stored.effort ?? "high",
      options: EFFORT_VALUES.map((value) => ({
        value,
        name: value[0].toUpperCase() + value.slice(1),
      })),
    },
  ];
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

function mapToolKind(toolName: string): ToolKind {
  const name = toolName.toLowerCase();
  if (name.includes("read") || name === "glob" || name === "grep") return "read";
  if (name.includes("edit") || name === "write" || name === "notebookedit") return "edit";
  if (name === "bash" || name === "task") return "execute";
  if (name.includes("web") || name.includes("fetch")) return "fetch";
  return "other";
}

async function buildContent(
  input: TurnInput,
  mode: ConversationMode,
): Promise<MessageParam["content"]> {
  const blocks: Exclude<MessageParam["content"], string> = [];
  if (input.text) blocks.push({ type: "text", text: input.text });
  for (const attachment of input.attachments) {
    if (attachment.mimeType.startsWith("image/")) {
      const data = await readFile(attachment.absolutePath);
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: attachment.mimeType as "image/png",
          data: data.toString("base64"),
        },
      });
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
        blocks.push({
          type: "text",
          text: `Attached file ${attachment.filename}:\n\n${content}`,
        });
        continue;
      }
    }
    blocks.push({
      type: "text",
      text:
        mode === "work"
          ? `Attached file at ./input/${attachment.relativePath}`
          : `Attachment ${attachment.filename} could not be inlined (unsupported type).`,
    });
  }
  return blocks;
}

function buildCanUseTool(conv: ConversationRow): CanUseTool {
  return async (toolName, input, { suggestions }) => {
    if (toolName === "AskUserQuestion") {
      return handleQuestion(conv, input);
    }
    const allowed = alwaysAllowed.get(conv.id);
    if (allowed?.has(toolName)) return { behavior: "allow", updatedInput: input };

    const reply = await askPermission(conv.id, {
      title: toolName,
      toolKind: mapToolKind(toolName),
      rawInput: input,
      locations: [],
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "allow_always", name: "Always allow", kind: "allow_always" },
        { optionId: "reject", name: "Reject", kind: "reject_once" },
      ],
    });
    if (reply.outcome === "selected" && reply.optionId.startsWith("allow")) {
      if (reply.optionId === "allow_always") {
        const set = alwaysAllowed.get(conv.id) ?? new Set<string>();
        set.add(toolName);
        alwaysAllowed.set(conv.id, set);
      }
      return {
        behavior: "allow",
        updatedInput: input,
        updatedPermissions:
          reply.optionId === "allow_always" ? (suggestions as PermissionUpdate[]) : undefined,
      };
    }
    return { behavior: "deny", message: "The user rejected this action" };
  };
}

async function handleQuestion(
  conv: ConversationRow,
  input: Record<string, unknown>,
): Promise<Awaited<ReturnType<CanUseTool>>> {
  interface Question {
    question: string;
    header: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
  }
  const questions = (input.questions ?? []) as Question[];
  const schema: ElicitationSchema = {
    type: "object",
    title: questions[0]?.header ?? "Question",
    properties: Object.fromEntries(
      questions.map((entry) => [
        entry.question,
        {
          type: "string" as const,
          title: entry.header,
          description: entry.question,
          oneOf: entry.options.map((option) => ({
            const: option.label,
            title: option.label,
          })),
        },
      ]),
    ),
    required: questions.map((entry) => entry.question),
  };
  const reply = await askElicitation(conv.id, {
    message: questions.map((entry) => entry.question).join("\n"),
    requestedSchema: schema,
  });
  if (reply.action !== "accept") {
    return { behavior: "deny", message: "The user declined to answer" };
  }
  const answers = Object.fromEntries(
    Object.entries(reply.content).map(([question, value]) => [question, String(value)]),
  );
  return { behavior: "allow", updatedInput: { ...input, answers } };
}

async function persistSessionId(conv: ConversationRow, sessionId: string): Promise<void> {
  if (conv.engine_session_id === sessionId && !conv.fork_pending) return;
  await db
    .update(conversation)
    .set({ engine_session_id: sessionId, fork_pending: null })
    .where(eq(conversation.id, conv.id));
  conv.engine_session_id = sessionId;
  conv.fork_pending = null;
}

export function createClaudeDriver(): EngineDriver {
  return {
    id: "claude",
    name: "Claude Code",
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
      commands: true,
    },

    async ensureSession(conv) {
      const cached = cachedSessionConfig(conv.id);
      if (cached) return cached;
      return setCachedSessionConfig(conv.id, synthesizeConfig(storedOptions(conv)));
    },

    async deleteSession(conv) {
      dropCachedSessionConfig(conv.id);
      commandsByConversation.delete(conv.id);
      alwaysAllowed.delete(conv.id);
      await rm(projectDir(getConversationRoot(conv)), { recursive: true, force: true });
    },

    async forkSession(source, target, atEngineMessageId) {
      if (!source.engine_session_id) {
        throw new Error("Source conversation has no session to fork");
      }
      const sourceDir = projectDir(getConversationRoot(source));
      const targetDir = projectDir(getConversationRoot(target));
      await mkdir(targetDir, { recursive: true });
      await copyFile(
        join(sourceDir, `${source.engine_session_id}.jsonl`),
        join(targetDir, `${source.engine_session_id}.jsonl`),
      ).catch(async () => {
        // Session file may have sidecar state; copy the whole project dir.
        await cp(sourceDir, targetDir, { recursive: true, force: true });
      });
      const pending: ForkPending = {
        sessionId: source.engine_session_id,
        anchor: atEngineMessageId,
      };
      return { engineSessionId: null, forkPending: JSON.stringify(pending) };
    },

    async rewindTo(conv, atEngineMessageId) {
      if (!conv.engine_session_id && !conv.fork_pending) return;
      // No anchor = rewind to the very start: a fresh session, nothing to carry.
      let serialized: string | null = null;
      if (atEngineMessageId) {
        const base = conv.fork_pending
          ? (JSON.parse(conv.fork_pending) as ForkPending).sessionId
          : conv.engine_session_id!;
        serialized = JSON.stringify({
          sessionId: base,
          anchor: atEngineMessageId,
        } satisfies ForkPending);
      }
      await db
        .update(conversation)
        .set({ fork_pending: serialized, engine_session_id: null })
        .where(eq(conversation.id, conv.id));
      conv.fork_pending = serialized;
      conv.engine_session_id = null;
    },

    async runTurn(conv, input, sink, signal) {
      const stored = storedOptions(conv);
      const root = getConversationRoot(conv);
      const abortController = new AbortController();
      const onAbort = () => abortController.abort();
      if (signal.aborted) onAbort();
      signal.addEventListener("abort", onAbort, { once: true });

      const forkPending: ForkPending | null = conv.fork_pending
        ? (JSON.parse(conv.fork_pending) as ForkPending)
        : null;

      const agentEnv = await loadAgentEnv("claude");
      const mcpServers = await resolveClaudeMcpServers(conv.project_id);
      // "project" settings load the conversation root's materialized
      // instructions and skills without pulling in ~/.claude user config.
      const modeOptions: Partial<Options> =
        conv.mode === "chat"
          ? {
              tools: CHAT_TOOLS,
              systemPrompt: CHAT_SYSTEM_PROMPT,
              settingSources: ["project"],
              skills: "all",
              mcpServers,
            }
          : {
              systemPrompt: { type: "preset", preset: "claude_code" },
              settingSources: ["project"],
              mcpServers,
            };

      const content = await buildContent(input, conv.mode);
      async function* prompt(): AsyncIterable<SDKUserMessage> {
        yield {
          type: "user",
          session_id: "",
          parent_tool_use_id: null,
          message: { role: "user", content },
        };
      }

      const response = query({
        prompt: prompt(),
        options: {
          ...modeOptions,
          cwd: root,
          env: { ...process.env, ...agentEnv } as Record<string, string>,
          includePartialMessages: true,
          abortController,
          canUseTool: buildCanUseTool(conv),
          ...(stored.model && stored.model !== "default" ? { model: stored.model } : {}),
          effort: (stored.effort as EffortValue) ?? "high",
          ...(forkPending
            ? {
                resume: forkPending.sessionId,
                forkSession: true,
                ...(forkPending.anchor ? { resumeSessionAt: forkPending.anchor } : {}),
              }
            : conv.engine_session_id
              ? { resume: conv.engine_session_id }
              : {}),
        },
      });

      let stopReason: StopReason = "end_turn";
      let tokens: TurnTokens | null = null;
      let costUsd: number | null = null;
      let context: { used: number; size: number } | null = null;
      let lastAssistantUuid: string | null = null;
      let resultError: string | null = null;

      try {
        for await (const raw of response) {
          const msg = raw as Record<string, any>;
          if (msg.type === "system" && msg.subtype === "init") {
            await persistSessionId(conv, msg.session_id as string);
            const commands = ((msg.slash_commands ?? []) as string[]).map((name) => ({ name }));
            commandsByConversation.set(conv.id, commands);
            sink.emit("commands", { commands });
            continue;
          }
          if (msg.type === "stream_event") {
            const event = msg.event as Record<string, any>;
            if (event?.type === "content_block_delta") {
              const delta = event.delta as Record<string, any>;
              if (delta?.type === "text_delta") {
                await sink.appendText("text", delta.text as string);
              } else if (delta?.type === "thinking_delta") {
                await sink.appendText("reasoning", delta.thinking as string);
              }
            }
            continue;
          }
          if (msg.type === "assistant") {
            if (msg.uuid) {
              lastAssistantUuid = msg.uuid as string;
              sink.setEngineMessageId(lastAssistantUuid);
            }
            for (const block of msg.message?.content ?? []) {
              if (block.type !== "tool_use") continue;
              if (block.name === "TodoWrite") {
                const todos = (block.input?.todos ?? []) as Array<{
                  content: string;
                  status: string;
                }>;
                sink.emit("plan", {
                  entries: todos.map((todo) => ({
                    content: todo.content,
                    priority: "medium",
                    status:
                      todo.status === "completed"
                        ? "completed"
                        : todo.status === "in_progress"
                          ? "in_progress"
                          : "pending",
                  })),
                });
                continue;
              }
              await sink.upsertToolCall({
                toolCallId: block.id as string,
                title: block.name as string,
                kind: mapToolKind(block.name as string),
                status: "in_progress",
                rawInput: block.input,
              });
            }
            continue;
          }
          if (msg.type === "user") {
            for (const block of msg.message?.content ?? []) {
              if (block?.type !== "tool_result") continue;
              const items: ToolContentView[] = [];
              const blockContent = block.content;
              if (typeof blockContent === "string") {
                items.push({ type: "text", text: blockContent });
              } else if (Array.isArray(blockContent)) {
                for (const item of blockContent) {
                  if (item?.type === "text") items.push({ type: "text", text: item.text });
                }
              }
              await sink.upsertToolCall({
                toolCallId: block.tool_use_id as string,
                status: block.is_error ? "failed" : "completed",
                content: items,
                rawOutput: blockContent,
              });
            }
            continue;
          }
          if (msg.type === "result") {
            if (msg.subtype === "error_max_turns") stopReason = "max_turn_requests";
            else if (msg.is_error) {
              resultError = ((msg.errors as string[]) ?? []).join("; ") || msg.subtype;
            }
            if (msg.user_message_uuid) {
              sink.setUserEngineMessageId(msg.user_message_uuid as string);
            }
            const usage = msg.usage as Record<string, number> | undefined;
            if (usage) {
              tokens = {
                input: usage.input_tokens ?? 0,
                output: usage.output_tokens ?? 0,
                cacheRead: usage.cache_read_input_tokens ?? undefined,
                cacheWrite: usage.cache_creation_input_tokens ?? undefined,
                total:
                  (usage.input_tokens ?? 0) +
                  (usage.output_tokens ?? 0) +
                  (usage.cache_read_input_tokens ?? 0) +
                  (usage.cache_creation_input_tokens ?? 0),
              };
            }
            costUsd = (msg.total_cost_usd as number) ?? null;
            const modelUsage = msg.modelUsage as
              | Record<string, Record<string, number>>
              | undefined;
            const primary = modelUsage
              ? Object.values(modelUsage).sort(
                  (a, b) => (b.inputTokens ?? 0) - (a.inputTokens ?? 0),
                )[0]
              : undefined;
            if (primary?.contextWindow) {
              context = {
                used:
                  (primary.inputTokens ?? 0) +
                  (primary.cacheReadInputTokens ?? 0) +
                  (primary.cacheCreationInputTokens ?? 0) +
                  (primary.outputTokens ?? 0),
                size: primary.contextWindow,
              };
              sink.emit("usage", { used: context.used, size: context.size, cost: null });
            }
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          stopReason = "cancelled";
        } else {
          throw error;
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
      }

      if (resultError) throw new Error(resultError);
      if (signal.aborted) stopReason = "cancelled";

      return {
        stopReason,
        tokens,
        cumulativeTokens: false,
        costUsd,
        context,
        title: null,
      };
    },

    async agentConfig(_mode, modelValue) {
      const stored: Record<string, string> = modelValue ? { model: modelValue } : {};
      return synthesizeConfig(stored);
    },

    sessionConfigFor(conversationId) {
      return cachedSessionConfig(conversationId);
    },

    async setConfigOption(conv, configId, value) {
      if (typeof value !== "string" || !["model", "effort"].includes(configId)) {
        throw new Error(`Unknown config option: ${configId}`);
      }
      await persistChosenOption(conv, configId, value);
      const config = synthesizeConfig(storedOptions(conv));
      return setCachedSessionConfig(conv.id, config);
    },

    async listCommands(conv) {
      return commandsByConversation.get(conv.id) ?? [];
    },

    async status() {
      return {
        available: true,
        running: false,
        version: sdkVersion,
        authHint:
          "Uses your Claude subscription via `claude` login (~/.claude/.credentials.json), or set ANTHROPIC_API_KEY as an env var.",
      };
    },

    async stop() {
      // No supervised process: each turn owns its own subprocess lifecycle.
    },
  };
}

async function resolveClaudeMcpServers(
  projectId: string | null,
): Promise<Record<string, McpServerConfig>> {
  const servers = await resolveMcpServers(projectId);
  return Object.fromEntries(
    servers.map((server) => [
      server.name,
      server.transport.type === "stdio"
        ? {
            type: "stdio" as const,
            command: server.transport.command,
            args: server.transport.args,
            env: server.transport.env,
          }
        : {
            type: "http" as const,
            url: server.transport.url,
            headers: server.transport.headers,
          },
    ]),
  );
}
