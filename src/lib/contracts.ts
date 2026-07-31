// Shared DTOs and SSE envelope types describing the wire between the Elysia
// API and any client. Every type here is Kepler-owned; engine drivers
// translate their native SDK shapes into these.

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export interface ToolCallLocation {
  path: string;
  line?: number | null;
}

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

export type PermissionOptionKind =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always";

export interface PlanEntry {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
}

export interface SessionConfigSelectOption {
  value: string;
  name: string;
  description?: string | null;
}

export interface SessionConfigSelectGroup {
  group: string;
  name: string;
  options: SessionConfigSelectOption[];
}

export type SessionConfigOption = {
  id: string;
  name: string;
  description?: string | null;
  /** Semantic category; drivers set "model" on the model option. */
  category?: string | null;
} & (
  | {
      type: "select";
      currentValue: string;
      options: SessionConfigSelectOption[] | SessionConfigSelectGroup[];
    }
  | { type: "boolean"; currentValue: boolean }
);

/** JSON-schema subset RequestDialog renders for elicitation forms. */
export interface ElicitationPropertySchema {
  type?: "string" | "boolean" | "number" | "integer" | "array" | "object";
  [key: string]: unknown;
}

export interface ElicitationSchema {
  type?: "object";
  title?: string;
  properties?: Record<string, ElicitationPropertySchema>;
  required?: string[];
}

/** Max length for instruction/skill documents, enforced by API schemas and form inputs. */
export const INSTRUCTIONS_MAX_LENGTH = 65536;

export const AGENT_IDS = ["opencode", "claude", "codex"] as const;
export const STOP_REASONS = [
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
] as const satisfies readonly StopReason[];
export type AgentId = (typeof AGENT_IDS)[number];

export const CONVERSATION_MODES = ["chat", "work"] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export interface ConversationDTO {
  id: string;
  agent_id: AgentId;
  mode: ConversationMode;
  project_id: string | null;
  title: string;
  /** Non-null while a public read-only link is live. */
  share_token: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectDTO {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}


export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

export type ToolContentView =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText?: string | null; newText: string };

export type PartView =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "reasoning"; text: string }
  | {
      id: string;
      type: "tool";
      toolCallId: string;
      title: string;
      kind: ToolKind;
      status: ToolStatus;
      content: ToolContentView[];
      locations: ToolCallLocation[];
      rawInput?: unknown;
      rawOutput?: unknown;
    }
  | {
      id: string;
      type: "file";
      url: string;
      filename: string;
      mimeType?: string;
      /** Text files only; lets the chip say how much there is to read. */
      lines?: number;
    };

export interface TurnTokens {
  input: number;
  output: number;
  thought?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total: number;
}

export interface MessageView {
  id: string;
  role: "user" | "assistant";
  parts: PartView[];
  stopReason?: StopReason;
  error?: string;
  modelValue?: string;
  cost?: number;
  tokens?: TurnTokens;
  createdAt: number;
  completedAt?: number;
  /** Native engine message/turn id; anchors edit/regenerate/branch-at-message. */
  engineMessageId?: string;
}

export interface SendMessageInput {
  text: string;
  attachments?: Array<{
    path: string;
    mimeType?: string;
    filename?: string;
  }>;
}


/** Per-conversation action gating; the UI offers exactly what the driver supports. */
export interface SessionActionCapabilities {
  fork: boolean;
  forkAtMessage: boolean;
  editMessage: boolean;
  regenerate: boolean;
  compact: boolean;
}

export interface SessionConfigDTO {
  configOptions: SessionConfigOption[];
  capabilities: SessionActionCapabilities;
}

/**
 * Agents key the model option by `category` per spec, but some only set `id`;
 * every consumer must agree or enrichment and persistence disagree.
 */
export function isModelOption(option: SessionConfigOption): boolean {
  return option.category === "model" || option.id === "model";
}

export interface SessionUsageDTO {
  used: number;
  size: number;
  cost: number | null;
}

/** A slash command the agent advertises via `available_commands_update`. */
export interface AgentCommand {
  name: string;
  description?: string;
  /** Placeholder for the free text the command takes after its name. */
  hint?: string;
}


export interface PermissionOptionDTO {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
}

export interface PermissionRequestDTO {
  requestId: string;
  conversationId: string;
  title: string;
  toolKind: ToolKind | null;
  rawInput: unknown;
  locations: ToolCallLocation[];
  options: PermissionOptionDTO[];
}

export interface ElicitationRequestDTO {
  requestId: string;
  conversationId: string;
  message: string;
  requestedSchema: ElicitationSchema;
}

export type PendingRequestDTO =
  | { type: "permission"; request: PermissionRequestDTO }
  | { type: "elicitation"; request: ElicitationRequestDTO };

export type ElicitationReply =
  | { action: "accept"; content: Record<string, unknown> }
  | { action: "decline" }
  | { action: "cancel" };


export type Modality = "text" | "image" | "audio" | "video" | "pdf";
export type AttachmentModality = Exclude<Modality, "text">;

export interface ModelInfo {
  providerId: string;
  modelId: string;
  name: string;
  contextLimit: number | null;
  cost: { input: number; output: number; cache_read?: number; cache_write?: number } | null;
  reasoning: boolean;
  toolCall: boolean;
  input: Modality[];
  output: Modality[];
}

/** Which attachment kinds a model accepts, for the composer's compatibility check. */
export function acceptsModality(info: ModelInfo, modality: AttachmentModality): boolean {
  return info.input.includes(modality);
}

export function fileModality(mimeType: string): AttachmentModality | null {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return null;
}

export type McpServerConfig =
  | {
      type: "local";
      command: string[];
      environment?: Record<string, string>;
      enabled?: boolean;
    }
  | {
      type: "remote";
      url: string;
      headers?: Record<string, string>;
      enabled?: boolean;
    };

export interface McpServerEntry {
  name: string;
  scope: "global" | "project";
  config: McpServerConfig;
}

export interface SkillEntry {
  name: string;
  description: string;
  content: string;
  scope: "global" | "project";
}

export const MCP_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Static per-engine capability descriptor, mirrored from the driver. */
export interface AgentCapabilitiesDTO {
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

export interface AgentStatusDTO {
  agentId: AgentId;
  name: string;
  /** Executable resolved and spawnable. */
  available: boolean;
  running: boolean;
  version: string | null;
  /** Human instructions for out-of-band login. */
  authHint: string | null;
  envKeys: string[];
  capabilities: AgentCapabilitiesDTO;
}


export interface MediaDTO {
  id: string;
  filename: string;
  mimeType?: string;
  size: number;
  createdAt: Date;
}

export interface FileEntryDTO {
  path: string;
  size: number;
  mtime: string;
  isDir: boolean;
}

export interface UploadedFileDTO {
  path: string;
  size: number;
  mimeType?: string;
}

export interface UploadFileResponse {
  success: true;
  file: UploadedFileDTO;
}

export interface ListOutputFilesResponse {
  files: FileEntryDTO[];
}

export type FileScope = "input" | "output";

export function downloadFileUrl(
  conversationId: string,
  path: string,
  scope: FileScope = "output",
): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `/api/conversations/${encodeURIComponent(conversationId)}/files/${encodedPath}?scope=${scope}`;
}


export type PermissionAction = "allow" | "ask" | "deny";

export const PERMISSION_TOOLS = [
  "bash",
  "edit",
  "webfetch",
  "websearch",
  "codesearch",
  "external_directory",
] as const;
export type PermissionTool = (typeof PERMISSION_TOOLS)[number];

export type PermissionSettings = Record<PermissionTool, PermissionAction>;


export interface UsageDay {
  day: string;
  cost: number;
  tokens: number;
  messages: number;
}

export interface UsageModel {
  agentId: string;
  modelValue: string;
  cost: number;
  input: number;
  output: number;
  reasoning: number;
  messages: number;
}

export interface UsageConversation {
  id: string;
  title: string;
  cost: number;
  tokens: number;
  messages: number;
}

export interface UsageResponse {
  days: UsageDay[];
  models: UsageModel[];
  topConversations: UsageConversation[];
  totals: { cost: number; tokens: number; messages: number };
  windowDays: number;
}

export interface MessageSearchResult {
  conversationId: string;
  title: string;
  role: string;
  snippet: string;
  time: number;
}


export interface StreamEventMap {
  /** Full message snapshot upsert (user echo adoption, assistant creation). */
  message: { message: MessageView };
  /** Part snapshot upsert at a position within a message. */
  part: { messageId: string; index: number; part: PartView };
  /** Text append for a streaming text/reasoning part. */
  delta: { messageId: string; partId: string; text: string };
  /** Full plan replacement (transient, not persisted). */
  plan: { entries: PlanEntry[] };
  usage: SessionUsageDTO;
  title: { title: string };
  config: SessionConfigDTO;
  commands: { commands: AgentCommand[] };
  "request.asked": PendingRequestDTO;
  "request.settled": { requestId: string };
  "turn.end": { stopReason: StopReason; message: MessageView | null };
  error: { message: string };
}

export type StreamEventName = keyof StreamEventMap;

export const STREAM_EVENT_NAMES = [
  "message",
  "part",
  "delta",
  "plan",
  "usage",
  "title",
  "config",
  "commands",
  "request.asked",
  "request.settled",
  "turn.end",
  "error",
] as const satisfies readonly StreamEventName[];

export type SSEEnvelope = {
  [K in StreamEventName]: { id: string; event: K; data: StreamEventMap[K] };
}[StreamEventName];
