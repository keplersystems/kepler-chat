// OpenCode driver: one supervised `opencode serve` for the app, sessions
// scoped per conversation root via the `directory` query. Turns run as a
// blocking v1 prompt; streaming rides the per-directory /event SSE, which on
// the v1 prompt path carries the legacy family (message.part.delta for text,
// message.part.updated for tools, permission/question.asked for requests).

import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import type {
  AssistantMessage,
  Event,
  FilePartInput,
  Model,
  Provider,
  QuestionInfo,
  TextPartInput,
} from "@opencode-ai/sdk/v2";
import type {
  ElicitationSchema,
  PlanEntry,
  SessionConfigDTO,
  SessionConfigOption,
  SessionConfigSelectGroup,
  StopReason,
  ToolContentView,
  ToolKind,
  TurnTokens,
} from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/kepler";
import { getConversationRoot } from "$lib/server/paths";
import { askElicitation, askPermission } from "../../core/requests";
import {
  cachedSessionConfig,
  createSessionEstablisher,
  dropCachedSessionConfig,
  persistChosenOption,
  setCachedSessionConfig,
  storedOptions,
} from "../../core/session-config-store";
import type {
  ConversationRow,
  EngineDriver,
  TurnResult,
  TurnSink,
} from "../../types";
import { isServerRunning, opencodeServer, opencodeVersion, stopServer } from "./server";

type OpencodeClient = Awaited<ReturnType<typeof opencodeServer>>["client"];

interface ProviderCatalog {
  all: Provider[];
  default: Record<string, string>;
  connected: string[];
}

const PLACEHOLDER_TITLE =
  /^(New session|Child session) - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z( \(fork #\d+\))?$/;

const SESSION_CAPABILITIES = {
  fork: true,
  forkAtMessage: true,
  editMessage: true,
  regenerate: true,
  compact: true,
};

let catalogPromise: Promise<ProviderCatalog> | null = null;

function providerCatalog(): Promise<ProviderCatalog> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const { client } = await opencodeServer();
      const { data } = await client.provider.list();
      if (!data) throw new Error("Failed to load OpenCode provider catalog");
      return data;
    })();
    catalogPromise.catch(() => {
      catalogPromise = null;
    });
  }
  return catalogPromise;
}

function splitModelValue(value: string): { providerID: string; modelID: string } | null {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  return { providerID: value.slice(0, slash), modelID: value.slice(slash + 1) };
}

function findModel(catalog: ProviderCatalog, value: string): Model | null {
  const parsed = splitModelValue(value);
  if (!parsed) return null;
  const provider = catalog.all.find((entry) => entry.id === parsed.providerID);
  if (!provider) return null;
  return (
    provider.models[parsed.modelID] ??
    Object.values(provider.models).find((model) => model.id === parsed.modelID) ??
    null
  );
}

function connectedProviders(catalog: ProviderCatalog): Provider[] {
  return catalog.all.filter(
    (provider) =>
      catalog.connected.includes(provider.id) && Object.keys(provider.models).length > 0,
  );
}

function defaultModelValue(catalog: ProviderCatalog): string | null {
  const providers = connectedProviders(catalog);
  for (const provider of providers) {
    const modelID = catalog.default[provider.id];
    if (modelID) return `${provider.id}/${modelID}`;
  }
  const first = providers[0];
  const model = first ? Object.values(first.models)[0] : undefined;
  return first && model ? `${first.id}/${model.id}` : null;
}

function resolveModelValue(catalog: ProviderCatalog, stored: Record<string, string>): string {
  if (stored.model && findModel(catalog, stored.model)) return stored.model;
  return defaultModelValue(catalog) ?? "";
}

function synthesizeConfig(
  catalog: ProviderCatalog,
  stored: Record<string, string>,
): SessionConfigDTO {
  const groups: SessionConfigSelectGroup[] = connectedProviders(catalog).map((provider) => ({
    group: provider.id,
    name: provider.name,
    options: Object.values(provider.models)
      .map((model) => ({ value: `${provider.id}/${model.id}`, name: model.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  const modelValue = resolveModelValue(catalog, stored);
  const options: SessionConfigOption[] = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: modelValue,
      options: groups,
    },
  ];
  const model = modelValue ? findModel(catalog, modelValue) : null;
  const variants = Object.keys(model?.variants ?? {});
  if (variants.length > 0) {
    options.push({
      id: "variant",
      name: "Variant",
      type: "select",
      currentValue:
        stored.variant && variants.includes(stored.variant) ? stored.variant : "default",
      options: [
        { value: "default", name: "Default" },
        ...variants.map((variant) => ({
          value: variant,
          name: variant[0].toUpperCase() + variant.slice(1),
        })),
      ],
    });
  }
  return { configOptions: options, capabilities: SESSION_CAPABILITIES };
}

function mapToolKind(tool: string): ToolKind {
  const name = tool.toLowerCase();
  if (["read", "glob", "grep", "list", "codesearch"].includes(name)) return "read";
  if (["edit", "write", "apply_patch", "patch", "multiedit"].includes(name)) return "edit";
  if (["bash", "shell", "task"].includes(name)) return "execute";
  if (name.includes("fetch") || name.includes("search")) return "fetch";
  return "other";
}

function realTitle(title: string | undefined): string | null {
  const trimmed = title?.trim();
  return trimmed && !PLACEHOLDER_TITLE.test(trimmed) ? trimmed : null;
}

function extractErrorMessage(error: { name: string; data: unknown }): string {
  const message = (error.data as { message?: unknown }).message;
  return typeof message === "string" ? message : error.name;
}

function mapTodos(todos: Array<{ content: string; status: string; priority: string }>): {
  entries: PlanEntry[];
} {
  const status = (value: string): PlanEntry["status"] =>
    value === "completed" || value === "cancelled"
      ? "completed"
      : value === "in_progress"
        ? "in_progress"
        : "pending";
  const priority = (value: string): PlanEntry["priority"] =>
    value === "high" || value === "low" ? value : "medium";
  return {
    entries: todos.map((todo) => ({
      content: todo.content,
      status: status(todo.status),
      priority: priority(todo.priority),
    })),
  };
}

function parseSlashCommand(text: string): { name: string; args: string } | null {
  if (!text.startsWith("/")) return null;
  const [name, ...rest] = text.slice(1).split(/\s+/);
  return name ? { name, args: rest.join(" ").trim() } : null;
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

async function handlePermissionAsk(
  client: OpencodeClient,
  conv: ConversationRow,
  root: string,
  properties: Extract<Event, { type: "permission.asked" }>["properties"],
): Promise<void> {
  const reply = await askPermission(conv.id, {
    title: properties.patterns.length
      ? `${properties.permission}: ${properties.patterns.join(", ")}`
      : properties.permission,
    toolKind: mapToolKind(properties.permission),
    rawInput: properties.metadata,
    locations: [],
    options: [
      { optionId: "once", name: "Allow", kind: "allow_once" },
      { optionId: "always", name: "Always allow", kind: "allow_always" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ],
  });
  const outcome =
    reply.outcome === "selected" ? (reply.optionId as "once" | "always" | "reject") : "reject";
  await client.permission.reply({
    requestID: properties.id,
    directory: root,
    reply: outcome,
  });
}

async function handleQuestionAsk(
  client: OpencodeClient,
  conv: ConversationRow,
  root: string,
  properties: Extract<Event, { type: "question.asked" }>["properties"],
): Promise<void> {
  const questions = properties.questions as QuestionInfo[];
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
            description: option.description,
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
  if (reply.action === "accept") {
    await client.question.reply({
      requestID: properties.id,
      directory: root,
      answers: questions.map((entry) => [String(reply.content[entry.question] ?? "")]),
    });
  } else {
    await client.question.reject({ requestID: properties.id, directory: root });
  }
}

/** Per-turn translation of the /event stream into sink calls. */
function createEventTranslator(
  client: OpencodeClient,
  conv: ConversationRow,
  sessionID: string,
  root: string,
  sink: TurnSink,
) {
  // Text/reasoning stream as message.part.delta chunks; part snapshots arrive
  // at flush boundaries with the full text so far, so track per-part progress
  // and only append the unseen tail. User message parts ride the same events,
  // hence the assistant-message allowlist.
  const partKinds = new Map<string, "text" | "reasoning">();
  const streamed = new Map<string, number>();
  const assistantMessages = new Set<string>();

  let title: string | null = null;
  let providerError: string | null = null;

  const appendTail = async (
    partId: string,
    kind: "text" | "reasoning",
    text: string,
  ): Promise<void> => {
    const seen = streamed.get(partId) ?? 0;
    if (text.length > seen) await sink.appendText(kind, text.slice(seen));
    streamed.set(partId, Math.max(seen, text.length));
  };

  const handleToolPart = async (
    part: Extract<Event, { type: "message.part.updated" }>["properties"]["part"] & {
      type: "tool";
    },
  ): Promise<void> => {
    const state = part.state;
    const input = state.status === "pending" ? undefined : state.input;
    const path = input && typeof input.filePath === "string" ? input.filePath : null;
    const content: ToolContentView[] = [];
    if (state.status === "completed") {
      if (path && (part.tool === "edit" || part.tool === "write")) {
        content.push({
          type: "diff",
          path,
          oldText: part.tool === "edit" ? String(input?.oldString ?? "") : null,
          newText: String((part.tool === "edit" ? input?.newString : input?.content) ?? ""),
        });
      } else if (state.output) {
        content.push({ type: "text", text: state.output });
      }
    } else if (state.status === "error") {
      content.push({ type: "text", text: state.error });
    }
    await sink.upsertToolCall({
      toolCallId: part.callID,
      title:
        state.status === "running" || state.status === "completed"
          ? state.title || part.tool
          : part.tool,
      kind: mapToolKind(part.tool),
      status:
        state.status === "pending"
          ? "pending"
          : state.status === "running"
            ? "in_progress"
            : state.status === "completed"
              ? "completed"
              : "failed",
      content: content.length ? content : null,
      locations: path ? [{ path }] : null,
      rawInput: input,
      rawOutput: state.status === "completed" ? state.metadata : undefined,
    });
  };

  const handle = async (event: Event): Promise<void> => {
    switch (event.type) {
      case "message.updated": {
        const p = event.properties;
        if (p.sessionID !== sessionID) return;
        if (p.info.role === "assistant") {
          assistantMessages.add(p.info.id);
          sink.setEngineMessageId(p.info.id);
        } else {
          sink.setUserEngineMessageId(p.info.id);
        }
        return;
      }
      case "message.part.delta": {
        const p = event.properties;
        if (p.sessionID !== sessionID || p.field !== "text") return;
        if (!assistantMessages.has(p.messageID)) return;
        const kind = partKinds.get(p.partID) ?? "text";
        streamed.set(p.partID, (streamed.get(p.partID) ?? 0) + p.delta.length);
        await sink.appendText(kind, p.delta);
        return;
      }
      case "message.part.updated": {
        const part = event.properties.part;
        if (part.sessionID !== sessionID) return;
        if (!assistantMessages.has(part.messageID)) return;
        if (part.type === "text") {
          if (part.synthetic || part.ignored) return;
          partKinds.set(part.id, "text");
          await appendTail(part.id, "text", part.text);
        } else if (part.type === "reasoning") {
          partKinds.set(part.id, "reasoning");
          await appendTail(part.id, "reasoning", part.text);
        } else if (part.type === "tool" && part.tool !== "todowrite") {
          await handleToolPart(part);
        } else if (part.type === "retry") {
          // opencode retries with growing backoff and reports nothing on the
          // message, so without this a doomed turn just looks slow.
          providerError = `${extractErrorMessage(part.error)} (attempt ${part.attempt})`;
        }
        return;
      }
      case "todo.updated":
        if (event.properties.sessionID !== sessionID) return;
        sink.emit("plan", mapTodos(event.properties.todos));
        return;
      case "permission.asked":
        if (event.properties.sessionID !== sessionID) return;
        void handlePermissionAsk(client, conv, root, event.properties).catch((error) => {
          console.error("OpenCode permission reply failed:", error);
        });
        return;
      case "question.asked":
        if (event.properties.sessionID !== sessionID) return;
        void handleQuestionAsk(client, conv, root, event.properties).catch((error) => {
          console.error("OpenCode question reply failed:", error);
        });
        return;
      case "session.error":
        if (event.properties.sessionID !== sessionID) return;
        if (event.properties.error) providerError = extractErrorMessage(event.properties.error);
        return;
      case "session.updated":
        if (event.properties.info.id !== sessionID) return;
        title = realTitle(event.properties.info.title) ?? title;
        return;
    }
  };

  return {
    handle,
    streamed,
    titleFromEvents: () => title,
    providerError: () => providerError,
  };
}

function mapStopReason(info: AssistantMessage): StopReason {
  if (!info.error) return "end_turn";
  switch (info.error.name) {
    case "MessageAbortedError":
      return "cancelled";
    case "MessageOutputLengthError":
      return "max_tokens";
    case "ContentFilterError":
      return "refusal";
    default:
      throw new Error(extractErrorMessage(info.error));
  }
}

function mapTokens(info: AssistantMessage): TurnTokens {
  const tokens = info.tokens;
  return {
    input: tokens.input,
    output: tokens.output,
    thought: tokens.reasoning || undefined,
    cacheRead: tokens.cache.read || undefined,
    cacheWrite: tokens.cache.write || undefined,
    total: tokens.total ?? tokens.input + tokens.output + tokens.reasoning,
  };
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export function createOpencodeDriver(): EngineDriver {
  async function establishSession(conv: ConversationRow): Promise<SessionConfigDTO> {
    const { client } = await opencodeServer();
    const root = getConversationRoot(conv);
    let sessionID = conv.engine_session_id;
    if (sessionID) {
      const { data } = await client.session.get({ sessionID, directory: root });
      if (!data) sessionID = null;
    }
    if (!sessionID) {
      const { data } = await client.session.create({
        directory: root,
        ...(conv.mode === "chat" ? { agent: "chat" } : {}),
      });
      if (!data) throw new Error("Failed to create OpenCode session");
      sessionID = data.id;
      await persistSessionId(conv, sessionID);
    }
    const config = synthesizeConfig(await providerCatalog(), storedOptions(conv));
    return setCachedSessionConfig(conv.id, config);
  }

  return {
    id: "opencode",
    name: "OpenCode",
    capabilities: {
      chatMode: true,
      fork: true,
      forkAtMessage: true,
      editMessage: true,
      regenerate: true,
      revertInPlace: true,
      modelCatalog: true,
      mcpStatus: true,
      compact: true,
      commands: true,
    },

    ensureSession: createSessionEstablisher(establishSession),

    async deleteSession(conv) {
      dropCachedSessionConfig(conv.id);
      if (!conv.engine_session_id) return;
      try {
        const { client } = await opencodeServer();
        await client.session.delete({
          sessionID: conv.engine_session_id,
          directory: getConversationRoot(conv),
        });
      } catch {
        // Best-effort: the conversation row is going away regardless.
      }
    },

    async forkSession(source, target, atEngineMessageId) {
      if (!source.engine_session_id) {
        throw new Error("Source conversation has no session to fork");
      }
      const { client } = await opencodeServer();
      const targetRoot = getConversationRoot(target);
      const { data } = await client.session.fork({
        sessionID: source.engine_session_id,
        directory: targetRoot,
        ...(atEngineMessageId ? { messageID: atEngineMessageId } : {}),
      });
      if (!data) throw new Error("Failed to fork OpenCode session");
      // Forks inherit the source directory; move so turns run (and events
      // publish) in the target conversation root.
      const moved = await client.experimental.controlPlane.moveSession({
        sessionID: data.id,
        destination: { directory: targetRoot },
      });
      if (moved.error) throw new Error("Failed to move forked OpenCode session");
      return { engineSessionId: data.id, forkPending: null };
    },

    async rewindTo(conv, atEngineMessageId) {
      if (!conv.engine_session_id) return;
      const { client } = await opencodeServer();
      const root = getConversationRoot(conv);
      const sessionID = conv.engine_session_id;
      const { data: messages } = await client.session.messages({ sessionID, directory: root });
      if (!messages) throw new Error("Failed to list OpenCode session messages");
      const ordered = [...messages].sort((a, b) => a.info.id.localeCompare(b.info.id));
      // OpenCode's revert boundary is the first DISCARDED message; our anchor
      // is the last SURVIVING one, so the boundary is the message after it.
      const boundary = atEngineMessageId
        ? ordered.find((entry) => entry.info.id > atEngineMessageId)
        : ordered[0];
      if (!boundary) return;
      const { data } = await client.session.revert({
        sessionID,
        directory: root,
        messageID: boundary.info.id,
      });
      if (!data) throw new Error("Failed to rewind OpenCode session");
    },

    async runTurn(conv, input, sink, signal) {
      const { client } = await opencodeServer();
      const root = getConversationRoot(conv);
      const sessionID = conv.engine_session_id;
      if (!sessionID) throw new Error("Conversation has no OpenCode session");

      const stored = storedOptions(conv);
      const catalog = await providerCatalog();
      const modelValue = resolveModelValue(catalog, stored);
      const model = splitModelValue(modelValue);
      if (!model) {
        throw new Error("No connected OpenCode provider; sign in or add provider API keys");
      }
      const variantOptions = Object.keys(findModel(catalog, modelValue)?.variants ?? {});
      const variant =
        stored.variant && variantOptions.includes(stored.variant) ? stored.variant : undefined;
      const agent = conv.mode === "chat" ? "chat" : undefined;

      const fileParts: FilePartInput[] = input.attachments.map((attachment) => ({
        type: "file",
        url: pathToFileURL(attachment.absolutePath).toString(),
        filename: attachment.filename,
        mime: attachment.mimeType,
      }));
      const parts: Array<TextPartInput | FilePartInput> = [...fileParts];
      if (input.text) parts.unshift({ type: "text", text: input.text });

      const translator = createEventTranslator(client, conv, sessionID, root, sink);
      const eventAbort = new AbortController();
      const subscription = await client.event.subscribe(
        { directory: root },
        { signal: eventAbort.signal },
      );
      let markConnected!: () => void;
      const connected = new Promise<void>((done) => {
        markConnected = done;
      });
      const pump = (async () => {
        for await (const event of subscription.stream) {
          markConnected();
          await translator.handle(event as Event);
        }
      })().catch((error) => {
        if (!eventAbort.signal.aborted) {
          console.error("OpenCode event stream failed:", error);
        }
      });
      // The stream opens with server.connected; without it deltas could race
      // the prompt. Cap the wait so a broken event route degrades to blocking.
      await Promise.race([connected, sleep(3000)]);

      const onAbort = () => {
        void client.session.abort({ sessionID, directory: root }).catch(() => {});
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });

      try {
        const command = parseSlashCommand(input.text);
        const knownCommand =
          command &&
          (await client.command.list({ directory: root })).data?.some(
            (entry) => entry.name === command.name,
          );
        const response =
          command && knownCommand
            ? await client.session.command({
                sessionID,
                directory: root,
                command: command.name,
                arguments: command.args,
                model: modelValue,
                agent,
                variant,
                parts: fileParts,
              })
            : await client.session.prompt({
                sessionID,
                directory: root,
                model,
                agent,
                variant,
                parts,
              });

        // Give in-flight SSE events a beat to drain before closing the stream.
        await Promise.race([pump, sleep(300)]);

        if (!response.data) {
          if (signal.aborted) {
            return {
              stopReason: "cancelled",
              tokens: null,
              cumulativeTokens: false,
              costUsd: null,
              context: null,
              title: null,
            } satisfies TurnResult;
          }
          const detail =
            response.error && typeof response.error === "object" && "message" in response.error
              ? String((response.error as { message: unknown }).message)
              : "OpenCode prompt failed";
          throw new Error(detail);
        }

        const info = response.data.info;
        sink.setEngineMessageId(info.id);
        // SSE gaps lose delta tail; the final parts carry the full text.
        for (const part of response.data.parts) {
          if (part.type !== "text" || part.synthetic || part.ignored) continue;
          const seen = translator.streamed.get(part.id) ?? 0;
          if (part.text.length > seen) await sink.appendText("text", part.text.slice(seen));
        }

        // A provider failure is often reported only on the event stream, and the
        // message comes back clean and empty, which reads as a silent hang. Only
        // claim it when the turn produced nothing: opencode's title agent runs on
        // this same session, and its failures are not this turn's failure.
        const producedReply = response.data.parts.some(
          (part) => part.type === "text" && !part.synthetic && !part.ignored,
        );
        if (!info.error && !signal.aborted && !producedReply) {
          const reported = translator.providerError();
          if (reported) throw new Error(reported);
        }
        let stopReason = mapStopReason(info);
        if (signal.aborted) stopReason = "cancelled";

        const limit = findModel(catalog, `${info.providerID}/${info.modelID}`)?.limit.context;
        const context = limit
          ? {
              used: info.tokens.input + info.tokens.cache.read + info.tokens.output,
              size: limit,
            }
          : null;

        const { data: session } = await client.session.get({ sessionID, directory: root });
        return {
          stopReason,
          tokens: mapTokens(info),
          cumulativeTokens: false,
          costUsd: info.cost,
          context,
          title: translator.titleFromEvents() ?? realTitle(session?.title),
        } satisfies TurnResult;
      } finally {
        signal.removeEventListener("abort", onAbort);
        eventAbort.abort();
        await pump;
      }
    },

    async agentConfig(_mode, modelValue) {
      const catalog = await providerCatalog();
      return synthesizeConfig(catalog, modelValue ? { model: modelValue } : {});
    },

    sessionConfigFor(conversationId) {
      return cachedSessionConfig(conversationId);
    },

    async setConfigOption(conv, configId, value) {
      if (typeof value !== "string" || !["model", "variant"].includes(configId)) {
        throw new Error(`Unknown config option: ${configId}`);
      }
      await persistChosenOption(conv, configId, value);
      const config = synthesizeConfig(await providerCatalog(), storedOptions(conv));
      return setCachedSessionConfig(conv.id, config);
    },

    async listCommands(conv) {
      const { client } = await opencodeServer();
      const { data } = await client.command.list({ directory: getConversationRoot(conv) });
      return (data ?? []).map((command) => ({
        name: command.name,
        description: command.description,
        hint: command.hints.join(" ") || undefined,
      }));
    },

    async status() {
      const version = await opencodeVersion();
      return {
        available: version !== null,
        running: isServerRunning(),
        version,
        authHint:
          "Sign in with `opencode auth login`, or add provider API keys as env values.",
      };
    },

    async stop() {
      await stopServer();
    },
  };
}
