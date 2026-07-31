// The engine seam: each agent integrates through an EngineDriver. Drivers own
// native SDK/protocol translation; the shared core (turn-runner, stream-hub,
// requests) owns persistence, SSE fan-out, and turn orchestration.

import type {
  AgentCommand,
  AgentId,
  ConversationMode,
  SessionConfigDTO,
  StopReason,
  StreamEventMap,
  StreamEventName,
  ToolCallLocation,
  ToolContentView,
  ToolKind,
  ToolStatus,
  TurnTokens,
} from "$lib/contracts";
import type { conversation } from "$lib/server/db/schema/kepler";

export type ConversationRow = typeof conversation.$inferSelect;

export type EmitFn = <K extends StreamEventName>(event: K, data: StreamEventMap[K]) => void;

export interface ResolvedAttachment {
  absolutePath: string;
  relativePath: string;
  filename: string;
  mimeType: string;
  /** Text files only. */
  lines?: number;
}

export interface TurnInput {
  text: string;
  attachments: ResolvedAttachment[];
}

export interface TurnResult {
  stopReason: StopReason;
  /** Turn token usage; `cumulativeTokens` says whether it needs delta-ing. */
  tokens: TurnTokens | null;
  cumulativeTokens: boolean;
  /** Per-turn USD when the engine reports it; null derives from usage events. */
  costUsd: number | null;
  context: { used: number; size: number } | null;
  /** Engine-generated conversation title, if the engine produced one. */
  title: string | null;
}

/** Kepler-owned tool-call update; drivers translate native content themselves. */
export interface ToolPartUpdate {
  toolCallId: string;
  title?: string | null;
  kind?: ToolKind | null;
  status?: ToolStatus | null;
  content?: ToolContentView[] | null;
  locations?: ToolCallLocation[] | null;
  rawInput?: unknown;
  rawOutput?: unknown;
}

/** Surface the turn-runner hands a driver for streaming a turn's output. */
export interface TurnSink {
  appendText(kind: "text" | "reasoning", text: string): Promise<void>;
  upsertToolCall(update: ToolPartUpdate): Promise<void>;
  /** Non-message events: plan, usage, config, commands. */
  emit: EmitFn;
  /** Native id of the in-progress assistant message/turn (fork anchor). */
  setEngineMessageId(id: string): void;
  /** Native id of the just-sent user message, when the engine reports one. */
  setUserEngineMessageId(id: string): void;
}

export interface EngineCapabilities {
  chatMode: boolean;
  fork: boolean;
  forkAtMessage: boolean;
  editMessage: boolean;
  regenerate: boolean;
  revertInPlace: boolean;
  modelCatalog: boolean;
  mcpStatus: boolean;
  compact: boolean;
  commands: boolean;
}

export interface EngineStatus {
  available: boolean;
  running: boolean;
  version: string | null;
  authHint: string | null;
}

export interface EngineDriver {
  readonly id: AgentId;
  readonly name: string;
  readonly capabilities: EngineCapabilities;

  /**
   * Idempotent: create or re-establish the native session for the
   * conversation (respecting conv.mode), persist engine_session_id, and
   * return the synthesized config. Must dedup concurrent callers.
   */
  ensureSession(conv: ConversationRow): Promise<SessionConfigDTO>;

  deleteSession(conv: ConversationRow): Promise<void>;

  /**
   * Fork source's session for target (target row not yet inserted; its
   * working directory already exists). `atEngineMessageId` truncates the fork
   * after that native message; undefined forks at head. Engines that fork
   * eagerly return the new session id; engines whose fork rides on the next
   * prompt (claude) return `forkPending` JSON for the conversation row,
   * consumed and cleared by their next runTurn.
   */
  forkSession(
    source: ConversationRow,
    target: ConversationRow,
    atEngineMessageId?: string,
  ): Promise<{ engineSessionId: string | null; forkPending: string | null }>;

  /**
   * Rewind the conversation's engine context so the next turn continues from
   * just after `atEngineMessageId` (an assistant anchor). Backs edit and
   * regenerate; callers delete the discarded Kepler rows themselves.
   * `atEngineMessageId` undefined rewinds to the session start.
   */
  rewindTo(conv: ConversationRow, atEngineMessageId?: string): Promise<void>;

  /**
   * Run one prompt turn, translating native events into sink calls. Must
   * resolve when `signal` aborts (stopReason "cancelled"), never hang.
   */
  runTurn(
    conv: ConversationRow,
    input: TurnInput,
    sink: TurnSink,
    signal: AbortSignal,
  ): Promise<TurnResult>;

  /** Config synthesis for the composer, before any conversation exists. */
  agentConfig(mode: ConversationMode, modelValue?: string): Promise<SessionConfigDTO | null>;

  sessionConfigFor(conversationId: string): SessionConfigDTO | null;

  setConfigOption(
    conv: ConversationRow,
    configId: string,
    value: string | boolean,
  ): Promise<SessionConfigDTO>;

  listCommands(conv: ConversationRow): Promise<AgentCommand[]>;

  status(): Promise<EngineStatus>;
  stop(): Promise<void>;
}
