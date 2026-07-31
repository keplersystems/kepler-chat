import { mkdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import {
  methods,
  RequestError,
  type AvailableCommand,
  type CreateElicitationRequest,
  type CreateElicitationResponse,
  type ElicitationFormMode,
  type ContentBlock,
  type PromptResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type SessionUpdate,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import { writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { isModelOption } from "$lib/contracts";
import type { AgentCommand, AgentId, SessionConfigDTO } from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/kepler";
import { resolveSafeFilePath } from "$lib/server/files";
import { resolveAcpMcpServers } from "$lib/server/mcp";
import { getConversationRoot, getProbeRoot } from "$lib/server/paths";
import { AgentHost, type AgentHandle } from "./connection";
import { askElicitation, askPermission } from "./requests";

type ConversationRow = typeof conversation.$inferSelect;

interface SessionBinding {
  conversationId: string;
  agentId: AgentId;
  sessionId: string;
  root: string;
  epoch: number;
  config: SessionConfigDTO;
  commands: AgentCommand[];
}

type UpdateSubscriber = (update: SessionUpdate) => void;

const COMMANDS_PUSH_GRACE_MS = 500;

const hosts = new Map<AgentId, AgentHost>();
/** Newest config an agent advertised, so the composer can offer real model choices
 *  before a conversation (and therefore a session) exists. */
const configByAgent = new Map<string, SessionConfigDTO>();
const bindingsBySession = new Map<string, SessionBinding>();
const bindingsByConversation = new Map<string, SessionBinding>();
const subscribers = new Map<string, UpdateSubscriber>();
const commandWaiters = new Map<string, Set<(commands: AgentCommand[]) => void>>();

const delegate = {
  onSessionUpdate(_agentId: AgentId, notification: SessionNotification): void {
    const binding = bindingsBySession.get(notification.sessionId);
    if (!binding) return;
    // Agents push commands right after session/new and session/load, so they
    // usually land with no generation running: cache here, not in the pump.
    if (notification.update.sessionUpdate === "available_commands_update") {
      updateCachedCommands(binding.conversationId, notification.update.availableCommands);
    }
    subscribers.get(binding.conversationId)?.(notification.update);
  },

  async requestPermission(
    _agentId: AgentId,
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    const binding = bindingsBySession.get(params.sessionId);
    if (!binding) return { outcome: { outcome: "cancelled" } };
    const outcome = await askPermission(binding.conversationId, {
      title: params.toolCall.title ?? params.toolCall.toolCallId,
      toolKind: params.toolCall.kind ?? null,
      rawInput: params.toolCall.rawInput,
      locations: params.toolCall.locations ?? [],
      options: params.options.map(({ optionId, name, kind }) => ({ optionId, name, kind })),
    });
    return { outcome };
  },

  async createElicitation(
    _agentId: AgentId,
    params: CreateElicitationRequest,
  ): Promise<CreateElicitationResponse> {
    const sessionId =
      "sessionId" in params && typeof params.sessionId === "string" ? params.sessionId : null;
    const binding = sessionId ? bindingsBySession.get(sessionId) : null;
    if (!binding || params.mode !== "form") return { action: "cancel" };
    // The custom-mode union member carries an index signature, so mode
    // narrowing alone cannot recover the form shape.
    const form = params as CreateElicitationRequest & ElicitationFormMode;
    const reply = await askElicitation(binding.conversationId, {
      message: form.message,
      requestedSchema: form.requestedSchema,
    });
    return reply.action === "accept"
      ? { action: "accept", content: reply.content }
      : { action: reply.action };
  },

  async readTextFile(
    _agentId: AgentId,
    params: ReadTextFileRequest,
  ): Promise<ReadTextFileResponse> {
    const filePath = await resolveSessionFilePath(params.sessionId, params.path);
    let content = await readFile(filePath, "utf8");
    if (params.line != null || params.limit != null) {
      const lines = content.split("\n");
      const start = Math.max(0, (params.line ?? 1) - 1);
      const end = params.limit != null ? start + params.limit : lines.length;
      content = lines.slice(start, end).join("\n");
    }
    return { content };
  },

  async writeTextFile(
    _agentId: AgentId,
    params: WriteTextFileRequest,
  ): Promise<WriteTextFileResponse> {
    const filePath = await resolveSessionFilePath(params.sessionId, params.path);
    await writeFile(filePath, params.content, "utf8");
    return {};
  },
};

async function resolveSessionFilePath(sessionId: string, absolutePath: string): Promise<string> {
  const binding = bindingsBySession.get(sessionId);
  if (!binding) throw RequestError.resourceNotFound("Unknown session");
  const relativePath = relative(binding.root, absolutePath);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw RequestError.invalidParams({ reason: "Path escapes the conversation root" });
  }
  return resolveSafeFilePath(binding.root, relativePath);
}

export function hostFor(agentId: AgentId): AgentHost {
  let host = hosts.get(agentId);
  if (!host) {
    host = new AgentHost(agentId, delegate);
    hosts.set(agentId, host);
  }
  return host;
}

export function subscribeUpdates(conversationId: string, subscriber: UpdateSubscriber): () => void {
  subscribers.set(conversationId, subscriber);
  return () => {
    if (subscribers.get(conversationId) === subscriber) {
      subscribers.delete(conversationId);
    }
  };
}

function rememberAgentConfig(agentId: AgentId, config: SessionConfigDTO): void {
  if (config.configOptions.length > 0) configByAgent.set(`${agentId}:`, config);
}

function bind(
  conv: ConversationRow,
  sessionId: string,
  epoch: number,
  config: SessionConfigDTO,
): SessionBinding {
  const previous = bindingsByConversation.get(conv.id);
  if (previous) bindingsBySession.delete(previous.sessionId);
  const binding: SessionBinding = {
    conversationId: conv.id,
    agentId: conv.agent_id,
    sessionId,
    root: getConversationRoot(conv),
    epoch,
    config,
    commands: previous?.sessionId === sessionId ? previous.commands : [],
  };
  bindingsBySession.set(sessionId, binding);
  bindingsByConversation.set(conv.id, binding);
  rememberAgentConfig(binding.agentId, config);
  return binding;
}

function toConfigDTO(
  resp: {
    configOptions?: SessionConfigDTO["configOptions"] | null;
    modes?: SessionConfigDTO["modes"] | null;
  },
  handle: AgentHandle,
): SessionConfigDTO {
  return {
    configOptions: resp.configOptions ?? [],
    modes: resp.modes ?? null,
    capabilities: capabilitiesOf(handle),
  };
}

function capabilitiesOf(handle: AgentHandle): SessionConfigDTO["capabilities"] {
  return { fork: !!handle.init.agentCapabilities?.sessionCapabilities?.fork };
}

function emptyConfig(handle: AgentHandle): SessionConfigDTO {
  return { configOptions: [], modes: null, capabilities: capabilitiesOf(handle) };
}

function isSessionGone(error: unknown): boolean {
  return (
    error instanceof RequestError &&
    (error.code === -32002 || error.code === -32601 || error.code === -32602)
  );
}

type StoredOptions = Record<string, string | boolean>;

/** Chosen options, with the model column folded in for rows written before it existed. */
function storedOptions(conv: ConversationRow): StoredOptions {
  const stored = conv.config_options ? (JSON.parse(conv.config_options) as StoredOptions) : {};
  return conv.model_value && !("model" in stored)
    ? { model: conv.model_value, ...stored }
    : stored;
}

async function reapplyStoredConfig(
  conv: ConversationRow,
  handle: AgentHandle,
  config: SessionConfigDTO,
  sessionId: string,
): Promise<SessionConfigDTO> {
  let current = config;
  // Every option the user chose, not just the model: agents expose reasoning
  // effort and similar as ordinary config options and they must survive a
  // session being re-established.
  for (const [configId, value] of Object.entries(storedOptions(conv))) {
    const option = current.configOptions.find((entry) => entry.id === configId);
    if (option?.type === "select" && option.currentValue === value) continue;
    if (option?.type === "boolean" && option.currentValue === value) continue;
    try {
      const resp = await handle.connection.agent.request(
        methods.agent.session.setConfigOption,
        typeof value === "boolean"
          ? { sessionId, configId, type: "boolean", value }
          : { sessionId, configId, value },
      );
      current = { ...current, configOptions: resp.configOptions };
    } catch (error) {
      console.warn(`[acp:${conv.agent_id}] failed to reapply ${configId}`, error);
    }
  }
  if (conv.mode_id && current.modes && current.modes.currentModeId !== conv.mode_id) {
    try {
      await handle.connection.agent.request(methods.agent.session.setMode, {
        sessionId,
        modeId: conv.mode_id,
      });
      current = {
        ...current,
        modes: current.modes ? { ...current.modes, currentModeId: conv.mode_id } : null,
      };
    } catch (error) {
      console.warn(`[acp:${conv.agent_id}] failed to reapply mode`, error);
    }
  }
  return current;
}

/**
 * Establishing a session mutates shared bindings and writes acp_session_id, so
 * concurrent callers (the chat page loads config, commands and files while the
 * first prompt is already in flight) must share one attempt — otherwise the
 * second `session/new` rebinds over the session actually being prompted and
 * every update for it is dropped.
 */
const establishing = new Map<string, Promise<SessionBinding>>();

export function ensureSession(conv: ConversationRow): Promise<SessionBinding> {
  const pending = establishing.get(conv.id);
  if (pending) return pending;
  const attempt = establish(conv).finally(() => establishing.delete(conv.id));
  establishing.set(conv.id, attempt);
  return attempt;
}

async function establish(conv: ConversationRow): Promise<SessionBinding> {
  const host = hostFor(conv.agent_id);
  const handle = await host.ensureRunning();

  // A caller may hold a row snapshot taken before the session existed; adopt
  // the live binding rather than establishing a second session for it.
  const existing = bindingsByConversation.get(conv.id);
  if (
    existing &&
    existing.epoch === handle.epoch &&
    (conv.acp_session_id === null || existing.sessionId === conv.acp_session_id)
  ) {
    conv.acp_session_id = existing.sessionId;
    return existing;
  }

  const cwd = getConversationRoot(conv);
  const mcpServers = await resolveAcpMcpServers(conv.project_id);
  const caps = handle.init.agentCapabilities?.sessionCapabilities;

  if (conv.acp_session_id) {
    const sessionId = conv.acp_session_id;
    // Bind before the request: fs/permission callbacks and load-replay
    // updates reference the session id before the response resolves.
    bind(conv, sessionId, handle.epoch, emptyConfig(handle));
    try {
      const resp = caps?.resume
        ? await handle.connection.agent.request(methods.agent.session.resume, {
            sessionId,
            cwd,
            mcpServers,
          })
        : await handle.connection.agent.request(methods.agent.session.load, {
            sessionId,
            cwd,
            mcpServers,
          });
      const config = await reapplyStoredConfig(conv, handle, toConfigDTO(resp, handle), sessionId);
      return bind(conv, sessionId, handle.epoch, config);
    } catch (error) {
      bindingsBySession.delete(sessionId);
      bindingsByConversation.delete(conv.id);
      if (!isSessionGone(error)) throw error;
    }
  }

  const resp = await handle.connection.agent.request(methods.agent.session.new, {
    cwd,
    mcpServers,
  });
  // Bind before awaiting anything else: the post-response command push would
  // otherwise arrive at an unbound session and be dropped.
  bind(conv, resp.sessionId, handle.epoch, emptyConfig(handle));
  await db
    .update(conversation)
    .set({ acp_session_id: resp.sessionId })
    .where(eq(conversation.id, conv.id));
  conv.acp_session_id = resp.sessionId;
  const config = await reapplyStoredConfig(conv, handle, toConfigDTO(resp, handle), resp.sessionId);
  return bind(conv, resp.sessionId, handle.epoch, config);
}

export async function promptSession(
  conv: ConversationRow,
  prompt: ContentBlock[],
): Promise<PromptResponse> {
  const binding = bindingsByConversation.get(conv.id);
  if (!binding) throw new Error("Session not established");
  const handle = await hostFor(binding.agentId).ensureRunning();
  return handle.connection.agent.request(methods.agent.session.prompt, {
    sessionId: binding.sessionId,
    prompt,
  });
}

export async function cancelSession(conversationId: string): Promise<void> {
  const binding = bindingsByConversation.get(conversationId);
  if (!binding) return;
  const host = hosts.get(binding.agentId);
  if (!host?.running) return;
  const handle = await host.ensureRunning();
  await handle.connection.agent.notify(methods.agent.session.cancel, {
    sessionId: binding.sessionId,
  });
}

export function sessionConfigFor(conversationId: string): SessionConfigDTO | null {
  return bindingsByConversation.get(conversationId)?.config ?? null;
}

export function sessionCommandsFor(conversationId: string): AgentCommand[] {
  return bindingsByConversation.get(conversationId)?.commands ?? [];
}

/**
 * Agents push their commands shortly after the session/new and session/load
 * responses, so a freshly established session has none cached yet and the
 * protocol offers no completion signal to wait on.
 */
export function awaitSessionCommands(conversationId: string): Promise<AgentCommand[]> {
  const cached = sessionCommandsFor(conversationId);
  if (cached.length > 0) return Promise.resolve(cached);
  return new Promise((resolve) => {
    let waiters = commandWaiters.get(conversationId);
    if (!waiters) commandWaiters.set(conversationId, (waiters = new Set()));
    const settle = (commands: AgentCommand[]) => {
      if (!waiters.delete(settle)) return;
      if (waiters.size === 0) commandWaiters.delete(conversationId);
      clearTimeout(timer);
      resolve(commands);
    };
    waiters.add(settle);
    const timer = setTimeout(
      () => settle(sessionCommandsFor(conversationId)),
      COMMANDS_PUSH_GRACE_MS,
    );
  });
}

export function updateCachedCommands(
  conversationId: string,
  available: AvailableCommand[],
): AgentCommand[] | null {
  const binding = bindingsByConversation.get(conversationId);
  if (!binding) return null;
  const commands = available.map(({ name, description, input }) => ({
    name,
    description: description || undefined,
    hint: input?.hint,
  }));
  const updated = { ...binding, commands };
  bindingsByConversation.set(conversationId, updated);
  bindingsBySession.set(binding.sessionId, updated);
  for (const waiter of [...(commandWaiters.get(conversationId) ?? [])]) waiter(commands);
  return commands;
}

export async function setSessionConfigOption(
  conv: ConversationRow,
  configId: string,
  value: string | boolean,
): Promise<SessionConfigDTO> {
  const binding = await ensureSession(conv);
  const handle = await hostFor(binding.agentId).ensureRunning();
  const resp =
    typeof value === "boolean"
      ? await handle.connection.agent.request(methods.agent.session.setConfigOption, {
          sessionId: binding.sessionId,
          configId,
          type: "boolean",
          value,
        })
      : await handle.connection.agent.request(methods.agent.session.setConfigOption, {
          sessionId: binding.sessionId,
          configId,
          value,
        });
  const config = updateCachedConfig(conv.id, (current) => ({
    ...current,
    configOptions: resp.configOptions,
  }))!;

  const options = { ...storedOptions(conv), [configId]: value };
  conv.config_options = JSON.stringify(options);
  await db
    .update(conversation)
    .set({
      config_options: conv.config_options,
      ...(configId === "model" && typeof value === "string" ? { model_value: value } : {}),
    })
    .where(eq(conversation.id, conv.id));
  return config;
}

export async function setSessionMode(
  conv: ConversationRow,
  modeId: string,
): Promise<SessionConfigDTO> {
  const binding = await ensureSession(conv);
  const handle = await hostFor(binding.agentId).ensureRunning();
  await handle.connection.agent.request(methods.agent.session.setMode, {
    sessionId: binding.sessionId,
    modeId,
  });
  // Some agents also expose the mode as a config option; keep the two in step
  // or the composer's picker reads back the stale one.
  const config = updateCachedConfig(conv.id, (current) => ({
    ...current,
    modes: current.modes ? { ...current.modes, currentModeId: modeId } : null,
    configOptions: current.configOptions.map((option) =>
      option.id === "mode" && option.type === "select"
        ? { ...option, currentValue: modeId }
        : option,
    ),
  }))!;
  await db.update(conversation).set({ mode_id: modeId }).where(eq(conversation.id, conv.id));
  return config;
}

export function updateCachedConfig(
  conversationId: string,
  mutate: (config: SessionConfigDTO) => SessionConfigDTO,
): SessionConfigDTO | null {
  const binding = bindingsByConversation.get(conversationId);
  if (!binding) return null;
  const updated = { ...binding, config: mutate(binding.config) };
  bindingsByConversation.set(conversationId, updated);
  bindingsBySession.set(binding.sessionId, updated);
  return updated.config;
}

/**
 * Config options for an agent with no conversation yet. Starting the agent is
 * the only way to learn them, so this spawns it on first use and caches.
 * Options can depend on the model (opencode only offers `effort` for models
 * that support it), so the probe applies one when asked and caches per model.
 */
export async function agentConfig(
  agentId: AgentId,
  modelValue?: string,
): Promise<SessionConfigDTO | null> {
  const key = `${agentId}:${modelValue ?? ""}`;
  const cached = configByAgent.get(key);
  if (cached) return cached;

  const handle = await hostFor(agentId).ensureRunning();
  const cwd = getProbeRoot(agentId);
  await mkdir(cwd, { recursive: true });
  const resp = await handle.connection.agent.request(methods.agent.session.new, {
    cwd,
    mcpServers: [],
  });
  let config = toConfigDTO(resp, handle);
  if (modelValue) {
    try {
      const applied = await handle.connection.agent.request(
        methods.agent.session.setConfigOption,
        { sessionId: resp.sessionId, configId: "model", value: modelValue },
      );
      config = { ...config, configOptions: applied.configOptions };
    } catch (error) {
      console.warn(`[acp:${agentId}] probe could not apply model`, error);
    }
  }
  if (config.configOptions.length > 0) configByAgent.set(key, config);
  if (handle.init.agentCapabilities?.sessionCapabilities?.close) {
    await handle.connection.agent
      .request(methods.agent.session.close, { sessionId: resp.sessionId })
      .catch(() => {});
  }
  return config;
}

export async function deleteSessionFor(conv: ConversationRow): Promise<void> {
  const binding = bindingsByConversation.get(conv.id);
  const host = hosts.get(conv.agent_id);
  if (binding) {
    bindingsBySession.delete(binding.sessionId);
    bindingsByConversation.delete(conv.id);
  }
  if (!conv.acp_session_id || !host?.running) return;
  const handle = await host.ensureRunning();
  const caps = handle.init.agentCapabilities?.sessionCapabilities;
  const method = caps?.delete
    ? methods.agent.session.delete
    : caps?.close
      ? methods.agent.session.close
      : null;
  if (!method) return;
  await handle.connection.agent
    .request(method, { sessionId: conv.acp_session_id })
    .catch((error) => {
      console.warn(`[acp:${conv.agent_id}] session cleanup failed`, error);
    });
}

export async function forkSession(
  source: ConversationRow,
  target: ConversationRow,
): Promise<string | null> {
  if (!source.acp_session_id) return null;
  const host = hostFor(source.agent_id);
  const handle = await host.ensureRunning();
  if (!handle.init.agentCapabilities?.sessionCapabilities?.fork) return null;
  await ensureSession(source);
  const resp = await handle.connection.agent.request(methods.agent.session.fork, {
    sessionId: source.acp_session_id,
    cwd: getConversationRoot(target),
    mcpServers: await resolveAcpMcpServers(target.project_id),
  });
  return resp.sessionId;
}

export async function listAgentSessions(
  agentId: AgentId,
  cwd: string,
): Promise<{ sessionId: string; title?: string | null }[]> {
  const host = hostFor(agentId);
  const handle = await host.ensureRunning();
  if (!handle.init.agentCapabilities?.sessionCapabilities?.list) return [];
  const resp = await handle.connection.agent.request(methods.agent.session.list, { cwd });
  return resp.sessions;
}

export async function stopAllAgents(): Promise<void> {
  await Promise.all([...hosts.values()].map((host) => host.stop()));
}
