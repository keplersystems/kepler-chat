// Shared DTOs and SSE envelope types. These describe the wire shape between
// the Elysia API and any client (web, native). Most other types are inferred
// directly from the Elysia App via Eden treaty.

import { z } from "zod";

export interface ConversationDTO {
  id: string;
  opencode_session_id: string;
  title: string;
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

export type PendingRequestDTO<TPermission = unknown, TQuestion = unknown> =
  | { type: "permission"; request: TPermission }
  | { type: "question"; request: TQuestion };

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
export type SSEEventName =
  | "message.updated"
  | "message.removed"
  | "message.part.updated"
  | "message.part.delta"
  | "message.part.removed"
  | "permission.asked"
  | "permission.replied"
  | "question.asked"
  | "question.replied"
  | "question.rejected"
  | "session.created"
  | "session.updated"
  | "session.deleted"
  | "session.status"
  | "session.idle"
  | "session.compacted"
  | "session.diff"
  | "session.error"
  | "todo.updated"
  | "command.executed"
  | "tui.session.select"
  | "error";

export interface SSEEnvelope<T = unknown> {
  id: string;
  event: SSEEventName;
  data: T;
}

export type SessionScopedEventPayloadMap = {
  "message.updated": unknown;
  "message.removed": unknown;
  "message.part.updated": unknown;
  "message.part.delta": unknown;
  "message.part.removed": unknown;
  "permission.asked": unknown;
  "permission.replied": unknown;
  "question.asked": unknown;
  "question.replied": unknown;
  "question.rejected": unknown;
  "session.created": unknown;
  "session.updated": unknown;
  "session.deleted": unknown;
  "session.status": unknown;
  "session.idle": unknown;
  "session.compacted": unknown;
  "session.diff": unknown;
  "session.error": unknown;
  "todo.updated": unknown;
  "command.executed": unknown;
  "tui.session.select": unknown;
  error: { message: string };
};

export type SessionScopedEventName = keyof SessionScopedEventPayloadMap;
