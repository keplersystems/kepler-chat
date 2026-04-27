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

export interface DeleteConversationResponse {
  success: true;
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

export interface PendingPermissionRequestDTO<T = unknown> {
  type: "permission";
  request: T;
}

export interface PendingQuestionRequestDTO<T = unknown> {
  type: "question";
  request: T;
}

export type PendingRequestDTO<TPermission = unknown, TQuestion = unknown> =
  | PendingPermissionRequestDTO<TPermission>
  | PendingQuestionRequestDTO<TQuestion>;

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
