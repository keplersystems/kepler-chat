import type {
  ConversationDTO,
  CreateConversationInput,
  FileScope,
  ListInstancesResponse,
  ListOutputFilesResponse,
  PendingRequestDTO,
  PermissionRequestReplyInput,
  QuestionRequestReplyInput,
  SendMessageInput,
  SuccessResponse,
  UploadFileResponse,
} from "@kepler-chat/contracts";
import type { ToolCallView } from "$lib/state/chat-types";

export interface Provider {
  id: string;
  name?: string;
  models?: Record<
    string,
    {
      id?: string;
      name?: string;
      capabilities?: {
        attachment?: boolean;
        input?: {
          text?: boolean;
          audio?: boolean;
          image?: boolean;
          video?: boolean;
          pdf?: boolean;
        };
      };
      modalities?: {
        input?: Array<"text" | "audio" | "image" | "video" | "pdf">;
      };
    }
  >;
  env?: string[];
}

export interface MirroredCredential {
  providerId: string;
  authType: string;
  keyVersion: number;
  updatedAt: string;
}

export interface NormalizedProvider {
  providerId: string;
  providerName: string;
  connected: boolean;
  authMode: "oauth" | "api_key" | "manual_env" | null;
  oauthMethods: Array<{ index: number; type: "oauth" | "api"; label: string }>;
  envVars: string[];
  keyLikeEnvVars: string[];
  primaryApiKeyEnvVar: string | null;
  requiresAdditionalEnv: boolean;
  envProfileStatus: {
    configuredCount: number;
    totalCount: number;
    configuredKeys: string[];
    missingKeys: string[];
    ready: boolean;
  };
}

export interface ProvidersResponse {
  providers: {
    all: Provider[];
    connected: string[];
  };
  mirroredCredentials: MirroredCredential[];
  normalizedProviders: NormalizedProvider[];
}

export interface SetProviderAuthInput {
  type: "api" | "wellknown";
  key: string;
  token?: string;
}

export interface OAuthAuthorizeResponse {
  url: string;
  method: "auto" | "code";
  instructions: string;
}

export interface OAuthCallbackInput {
  method: number;
  code?: string;
}

export interface ModelSelection {
  providerID: string;
  modelID: string;
}
import { parseSSEStream } from "$lib/sse";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
}

function resolveBaseUrl(): string {
  return (import.meta.env.PUBLIC_SERVER_URL as string | undefined) ?? "";
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };

  const response = await fetchImpl(`${resolveBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function listConversations(fetchImpl?: FetchLike): Promise<ConversationDTO[]> {
  return request<ConversationDTO[]>("/api/conversations", { fetchImpl });
}

export async function createConversation(
  input: CreateConversationInput,
  fetchImpl?: FetchLike,
): Promise<{ id: string; session: { id: string; title: string } }> {
  return request<{ id: string; session: { id: string; title: string } }>(
    "/api/conversations",
    { method: "POST", body: input, fetchImpl },
  );
}

export async function getConversation(
  id: string,
  fetchImpl?: FetchLike,
): Promise<ConversationDTO> {
  return request<ConversationDTO>(`/api/conversations/${id}`, { fetchImpl });
}

export async function deleteConversation(
  id: string,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/conversations/${id}`, {
    method: "DELETE",
    fetchImpl,
  });
}

export async function listMessages(id: string, fetchImpl?: FetchLike): Promise<unknown[]> {
  return request<unknown[]>(`/api/conversations/${id}/messages`, { fetchImpl });
}

export async function listRequests(
  id: string,
  fetchImpl?: FetchLike,
): Promise<{ requests: PendingRequestDTO[] }> {
  return request<{ requests: PendingRequestDTO[] }>(`/api/conversations/${id}/requests`, {
    fetchImpl,
  });
}

export async function replyPermission(
  id: string,
  requestId: string,
  payload: PermissionRequestReplyInput,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/conversations/${id}/permissions/${requestId}/reply`, {
    method: "POST",
    body: payload,
    fetchImpl,
  });
}

export async function replyQuestion(
  id: string,
  requestId: string,
  payload: QuestionRequestReplyInput,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/conversations/${id}/questions/${requestId}/reply`, {
    method: "POST",
    body: payload,
    fetchImpl,
  });
}

export async function rejectQuestion(
  id: string,
  requestId: string,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/conversations/${id}/questions/${requestId}/reject`, {
    method: "POST",
    fetchImpl,
  });
}

export async function listOutputFiles(
  id: string,
  prefix?: string,
  fetchImpl?: FetchLike,
): Promise<ListOutputFilesResponse> {
  const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
  return request<ListOutputFilesResponse>(`/api/conversations/${id}/files/output${query}`, {
    fetchImpl,
  });
}

export function downloadFileUrl(id: string, path: string, scope: FileScope = "output"): string {
  return `${resolveBaseUrl()}/api/conversations/${id}/files/${path}?scope=${scope}`;
}

export async function uploadFile(
  id: string,
  file: File,
  fetchImpl?: FetchLike,
): Promise<UploadFileResponse> {
  const formData = new FormData();
  formData.set("file", file);

  const fetcher = fetchImpl ?? fetch;
  const response = await fetcher(`${resolveBaseUrl()}/api/conversations/${id}/files/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as UploadFileResponse;
}

export async function* sendMessageStream(
  id: string,
  input: SendMessageInput,
  fetchImpl?: FetchLike,
) {
  const fetcher = fetchImpl ?? fetch;
  const response = await fetcher(`${resolveBaseUrl()}/api/conversations/${id}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Stream failed with status ${response.status}`);
  }

  yield* parseSSEStream(response.body);
}

export async function listAdminInstances(fetchImpl?: FetchLike): Promise<ListInstancesResponse> {
  return request<ListInstancesResponse>("/api/admin/instances", { fetchImpl });
}

export async function forceTeardownInstance(
  conversationId: string,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/admin/instances/${conversationId}`, {
    method: "DELETE",
    fetchImpl,
  });
}

// Provider APIs
export async function listProviders(fetchImpl?: FetchLike): Promise<ProvidersResponse> {
  return request<ProvidersResponse>("/api/providers", { fetchImpl });
}

export async function setProviderAuth(
  providerId: string,
  input: SetProviderAuthInput,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/providers/${providerId}/auth`, {
    method: "POST",
    body: input,
    fetchImpl,
  });
}

export async function removeProviderAuth(
  providerId: string,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/providers/${providerId}/auth`, {
    method: "DELETE",
    fetchImpl,
  });
}

export async function authorizeProviderOAuth(
  providerId: string,
  method: number,
  fetchImpl?: FetchLike,
): Promise<OAuthAuthorizeResponse> {
  return request<OAuthAuthorizeResponse>(`/api/providers/${providerId}/oauth/authorize`, {
    method: "POST",
    body: { method },
    fetchImpl,
  });
}

export async function callbackProviderOAuth(
  providerId: string,
  input: OAuthCallbackInput,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/providers/${providerId}/oauth/callback`, {
    method: "POST",
    body: input,
    fetchImpl,
  });
}

// Env profile APIs
export interface EnvSchemaField {
  key: string;
  required: boolean;
  inputKind: "text" | "secret" | "file_path";
  placeholder?: string;
  description?: string;
}

export interface EnvSchema {
  providerId: string;
  envSchema: EnvSchemaField[];
}

export interface EnvProfileValue {
  key: string;
  value: string | null;
  configured: boolean;
}

export interface EnvProfile {
  providerId: string;
  values: EnvProfileValue[];
}

export interface SetEnvProfileInput {
  values: Record<string, string>;
}

export interface UploadProviderEnvFileResponse {
  path: string;
}

export async function getProviderEnvSchema(
  providerId: string,
  fetchImpl?: FetchLike,
): Promise<EnvSchema> {
  return request<EnvSchema>(`/api/providers/${providerId}/env-schema`, { fetchImpl });
}

export async function getProviderEnvProfile(
  providerId: string,
  fetchImpl?: FetchLike,
): Promise<EnvProfile> {
  return request<EnvProfile>(`/api/providers/${providerId}/env-profile`, { fetchImpl });
}

export async function setProviderEnvProfile(
  providerId: string,
  input: SetEnvProfileInput,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/providers/${providerId}/env-profile`, {
    method: "PUT",
    body: input,
    fetchImpl,
  });
}

export async function deleteProviderEnvProfile(
  providerId: string,
  fetchImpl?: FetchLike,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/providers/${providerId}/env-profile`, {
    method: "DELETE",
    fetchImpl,
  });
}

export async function uploadProviderEnvFile(
  providerId: string,
  envKey: string,
  file: File,
  fetchImpl?: FetchLike,
): Promise<UploadProviderEnvFileResponse> {
  const formData = new FormData();
  formData.set("file", file);

  const fetcher = fetchImpl ?? fetch;
  const response = await fetcher(
    `${resolveBaseUrl()}/api/providers/${providerId}/env-file/${encodeURIComponent(envKey)}`,
    {
      method: "POST",
      body: formData,
      credentials: "include",
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as UploadProviderEnvFileResponse;
}

// Model selection APIs
export async function getConversationModel(
  conversationId: string,
  fetchImpl?: FetchLike,
): Promise<{ model: ModelSelection | null }> {
  return request<{ model: ModelSelection | null }>(`/api/conversations/${conversationId}/model`, { fetchImpl });
}

export async function setConversationModel(
  conversationId: string,
  model: ModelSelection,
  fetchImpl?: FetchLike,
): Promise<{ success: boolean; model: ModelSelection }> {
  return request<{ success: boolean; model: ModelSelection }>(`/api/conversations/${conversationId}/model`, {
    method: "PUT",
    body: model,
    fetchImpl,
  });
}

// Export as api object for convenience
export const api = {
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  listMessages,
  listRequests,
  replyToPermissionRequest: async (
    id: string,
    requestId: string,
    payload: PermissionRequestReplyInput,
    fetchImpl?: FetchLike,
  ): Promise<SuccessResponse> => {
    return replyPermission(id, requestId, payload, fetchImpl);
  },
  replyToQuestionRequest: async (
    id: string,
    requestId: string,
    payload: QuestionRequestReplyInput,
    fetchImpl?: FetchLike,
  ): Promise<SuccessResponse> => {
    return replyQuestion(id, requestId, payload, fetchImpl);
  },
  listOutputFiles,
  downloadFile: async (id: string, path: string, scope: FileScope = "output", fetchImpl?: FetchLike): Promise<Blob> => {
    const fetcher = fetchImpl ?? fetch;
    const response = await fetcher(downloadFileUrl(id, path, scope), {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }
    return response.blob();
  },
  uploadFile,
  listAdminInstances,
  forceTeardownInstance,
  listProviders,
  setProviderAuth,
  removeProviderAuth,
  authorizeProviderOAuth,
  callbackProviderOAuth,
  getProviderEnvSchema,
  getProviderEnvProfile,
  setProviderEnvProfile,
  deleteProviderEnvProfile,
  uploadProviderEnvFile,
  getConversationModel,
  setConversationModel,
};

// Helper function for streaming messages with callbacks
export async function streamMessage(
  id: string,
  input: SendMessageInput,
  callbacks: {
    onMessage?: (msg: unknown) => void;
    onDelta?: (messageId: string, delta: string) => void;
    onTitle?: (title: string) => void;
    onRequestAdded?: (request: PendingRequestDTO) => void;
    onRequestResolved?: (requestId: string) => void;
    onError?: (err: Error) => void;
    onComplete?: () => void;
  },
  fetchImpl?: FetchLike,
): Promise<void> {
  const roleByMessageId = new Map<string, "user" | "assistant" | "system">();
  const textByMessageId = new Map<string, string>();
  const reasoningByMessageId = new Map<string, string>();
  const toolCallsByMessageId = new Map<string, Map<string, ToolCallView>>();
  const finishByMessageId = new Map<string, string | undefined>();
  let lastEmittedTitle: string | null = null;

  const isTerminalFinish = (finish?: string): boolean =>
    typeof finish === "string" &&
    finish.length > 0 &&
    !["tool-calls", "unknown"].includes(finish);

  const shouldEmitAssistantMessage = (messageId: string): boolean => {
    const text = textByMessageId.get(messageId) ?? "";
    if (text.trim().length > 0) {
      return true;
    }
    const reasoning = reasoningByMessageId.get(messageId) ?? "";
    if (reasoning.trim().length > 0) {
      return true;
    }
    const toolCalls = toolCallsByMessageId.get(messageId);
    if (toolCalls && toolCalls.size > 0) {
      return true;
    }
    return isTerminalFinish(finishByMessageId.get(messageId));
  };

  const emitMessage = (
    messageId: string,
    role: "user" | "assistant" | "system",
    finish?: string,
  ) => {
    const resolvedFinish = finish ?? finishByMessageId.get(messageId);
    callbacks.onMessage?.({
      id: messageId,
      role,
      text: textByMessageId.get(messageId) ?? "",
      reasoning: reasoningByMessageId.get(messageId) ?? "",
      toolCalls: Array.from((toolCallsByMessageId.get(messageId) ?? new Map()).values()),
      finish: resolvedFinish,
    });
  };

  const upsertToolCall = (messageId: string, toolCall: ToolCallView) => {
    const current = toolCallsByMessageId.get(messageId) ?? new Map<string, ToolCallView>();
    const existing = current.get(toolCall.id);
    current.set(toolCall.id, {
      ...(existing ?? {}),
      ...toolCall,
    });
    toolCallsByMessageId.set(messageId, current);
  };

  const getRequestId = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    const obj = value as { id?: unknown; requestID?: unknown; requestId?: unknown };
    if (typeof obj.id === "string" && obj.id.length > 0) return obj.id;
    if (typeof obj.requestID === "string" && obj.requestID.length > 0) return obj.requestID;
    if (typeof obj.requestId === "string" && obj.requestId.length > 0) return obj.requestId;
    return null;
  };

  try {
    for await (const envelope of sendMessageStream(id, input, fetchImpl)) {
      if (envelope.event === "message.updated") {
        const data = envelope.data as {
          info?: {
            id?: string;
            role?: string;
            finish?: string;
            summary?: {
              title?: string;
            };
          };
        };
        const messageId = data.info?.id;
        const role = data.info?.role;
        if (!messageId || (role !== "user" && role !== "assistant" && role !== "system")) {
          continue;
        }

        if (role === "user") {
          const generatedTitle = data.info?.summary?.title?.trim();
          if (generatedTitle && generatedTitle !== lastEmittedTitle) {
            lastEmittedTitle = generatedTitle;
            callbacks.onTitle?.(generatedTitle);
          }
        }

        roleByMessageId.set(messageId, role);
        if (!textByMessageId.has(messageId)) {
          textByMessageId.set(messageId, "");
        }
        if (!toolCallsByMessageId.has(messageId)) {
          toolCallsByMessageId.set(messageId, new Map<string, ToolCallView>());
        }
        finishByMessageId.set(messageId, data.info?.finish);

        if (role === "assistant" || role === "system") {
          if (shouldEmitAssistantMessage(messageId)) {
            emitMessage(messageId, role, data.info?.finish);
          }
        }
      } else if (envelope.event === "message.part.updated") {
        const data = envelope.data as {
          delta?: string;
          part?: {
            messageID?: string;
            type?: string;
            text?: string;
          };
        };
        if (!data.part?.messageID) {
          continue;
        }

        const messageId = data.part.messageID;
        if (data.part.type === "text") {
          if (typeof data.delta === "string" && data.delta.length > 0) {
            textByMessageId.set(
              messageId,
              `${textByMessageId.get(messageId) ?? ""}${data.delta}`,
            );
          } else if (typeof data.part.text === "string") {
            textByMessageId.set(messageId, data.part.text);
          }
        } else if (data.part.type === "reasoning") {
          if (typeof data.delta === "string" && data.delta.length > 0) {
            reasoningByMessageId.set(
              messageId,
              `${reasoningByMessageId.get(messageId) ?? ""}${data.delta}`,
            );
          } else if (typeof data.part.text === "string") {
            reasoningByMessageId.set(messageId, data.part.text);
          }
        } else if (data.part.type === "tool") {
          const toolPart = data.part as {
            id?: string;
            callID?: string;
            tool?: string;
            state?: {
              status?: "pending" | "running" | "completed" | "error";
              input?: unknown;
              output?: string;
              error?: string;
            };
          };
          const toolId = toolPart.callID ?? toolPart.id ?? `tool-${Date.now()}`;
          const input =
            toolPart.state?.input !== undefined
              ? JSON.stringify(toolPart.state.input)
              : undefined;
          upsertToolCall(messageId, {
            id: toolId,
            name: toolPart.tool ?? "tool",
            status: toolPart.state?.status ?? "running",
            input,
            output: toolPart.state?.output,
            error: toolPart.state?.error,
          });
        } else {
          continue;
        }

        const role = roleByMessageId.get(messageId);
        if (role !== "assistant" && role !== "system") {
          continue;
        }
        if (shouldEmitAssistantMessage(messageId)) {
          emitMessage(messageId, role);
        }
      } else if (envelope.event === "message.part.delta") {
        const data = envelope.data as {
          id?: string;
          messageID?: string;
          delta?: string;
        };
        const messageId = data.messageID ?? data.id;
        if (!messageId || !data.delta) {
          continue;
        }

        textByMessageId.set(
          messageId,
          `${textByMessageId.get(messageId) ?? ""}${data.delta}`,
        );

        const role = roleByMessageId.get(messageId);
        if (role === "assistant" || role === "system") {
          if (shouldEmitAssistantMessage(messageId)) {
            emitMessage(messageId, role);
            callbacks.onDelta?.(messageId, data.delta);
          }
        }
      } else if (envelope.event === "permission.asked") {
        callbacks.onRequestAdded?.({
          type: "permission",
          request: envelope.data,
        });
      } else if (envelope.event === "question.asked") {
        callbacks.onRequestAdded?.({
          type: "question",
          request: envelope.data,
        });
      } else if (
        envelope.event === "permission.replied" ||
        envelope.event === "question.replied" ||
        envelope.event === "question.rejected"
      ) {
        const requestId = getRequestId(envelope.data);
        if (requestId) {
          callbacks.onRequestResolved?.(requestId);
        }
      } else if (envelope.event === "command.executed") {
        const data = envelope.data as {
          name?: string;
          arguments?: string;
          messageID?: string;
        };
        if (!data.messageID || !data.name) {
          continue;
        }
        const commandId = `cmd:${data.name}:${data.arguments ?? ""}`;
        upsertToolCall(data.messageID, {
          id: commandId,
          name: data.name,
          status: "executed",
          input: data.arguments,
        });
        const role = roleByMessageId.get(data.messageID);
        if ((role === "assistant" || role === "system") && shouldEmitAssistantMessage(data.messageID)) {
          emitMessage(data.messageID, role);
        }
      } else if (envelope.event === "error") {
        const data = envelope.data as { message?: string };
        callbacks.onError?.(new Error(data.message ?? "Stream error"));
      }
    }
    callbacks.onComplete?.();
  } catch (err) {
    callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}
