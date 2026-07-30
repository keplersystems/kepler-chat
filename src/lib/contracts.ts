// Shared DTOs and SSE envelope types. These describe the wire shape between
// the Elysia API and any client (web, native). Most other types are inferred
// directly from the Elysia App via Eden treaty. SSE payloads are the OpenCode
// SDK event `properties`, forwarded verbatim by the messages route.

import type { Event, PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2";

/** Max length for instruction/skill documents, enforced by API schemas and form inputs. */
export const INSTRUCTIONS_MAX_LENGTH = 65536;

export interface ConversationDTO {
  id: string;
  opencode_session_id: string;
  project_id: string | null;
  title: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectDTO {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface SendMessageInput {
  text: string;
  model: {
    providerID: string;
    modelID: string;
  };
  variant?: string;
  attachments?: Array<{
    path: string;
    mimeType?: string;
    filename?: string;
  }>;
}

export type PendingRequestDTO =
  | { type: "permission"; request: PermissionRequest }
  | { type: "question"; request: QuestionRequest };

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
  providerID: string;
  modelID: string;
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

/**
 * Session-scoped OpenCode events forwarded over the message stream.
 * Only events the web client consumes are forwarded.
 */
export const SERVER_EVENT_NAMES = [
  "message.updated",
  "message.removed",
  "message.part.updated",
  "message.part.delta",
  "message.part.removed",
  "permission.asked",
  "permission.replied",
  "question.asked",
  "question.replied",
  "question.rejected",
  "session.updated",
  "session.error",
  "todo.updated",
  "command.executed",
] as const satisfies readonly Event["type"][];

export type ServerEventName = (typeof SERVER_EVENT_NAMES)[number];
export type SSEEventName = ServerEventName | "error";

export type EventPayload<K extends ServerEventName> = Extract<
  Event,
  { type: K }
>["properties"];

export type SSEEnvelope =
  | {
      [K in ServerEventName]: { id: string; event: K; data: EventPayload<K> };
    }[ServerEventName]
  | { id: string; event: "error"; data: { message: string } };
