// Shared DTOs and SSE envelope types. These describe the wire shape between
// the Elysia API and any client (web, native). Most other types are inferred
// directly from the Elysia App via Eden treaty. SSE payloads are the OpenCode
// SDK event `properties`, forwarded verbatim by the messages route.

import { z } from "zod";
import type { Event, PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2";

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

export interface CreateConversationInput {
  title: string;
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

export const permissionReplySchema = z.enum(["once", "always", "reject"]);
export type PermissionReply = z.infer<typeof permissionReplySchema>;

export interface PermissionRequestReplyInput {
  reply: PermissionReply;
  message?: string;
}

export interface QuestionRequestReplyInput {
  answers: string[][];
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

export interface SuccessResponse {
  success: true;
}

// SSE

/** Session-scoped OpenCode events forwarded over the message stream. */
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
  "session.created",
  "session.updated",
  "session.deleted",
  "session.status",
  "session.idle",
  "session.compacted",
  "session.diff",
  "session.error",
  "todo.updated",
  "command.executed",
  "tui.session.select",
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
