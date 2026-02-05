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
import { parseSSEStream } from "$lib/sse";

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
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

export async function listConversations(fetchImpl?: typeof fetch): Promise<ConversationDTO[]> {
  return request<ConversationDTO[]>("/api/conversations", { fetchImpl });
}

export async function createConversation(
  input: CreateConversationInput,
  fetchImpl?: typeof fetch,
): Promise<{ id: string; session: { id: string; title: string } }> {
  return request<{ id: string; session: { id: string; title: string } }>(
    "/api/conversations",
    { method: "POST", body: input, fetchImpl },
  );
}

export async function getConversation(
  id: string,
  fetchImpl?: typeof fetch,
): Promise<ConversationDTO> {
  return request<ConversationDTO>(`/api/conversations/${id}`, { fetchImpl });
}

export async function deleteConversation(
  id: string,
  fetchImpl?: typeof fetch,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/conversations/${id}`, {
    method: "DELETE",
    fetchImpl,
  });
}

export async function listMessages(id: string, fetchImpl?: typeof fetch): Promise<unknown[]> {
  return request<unknown[]>(`/api/conversations/${id}/messages`, { fetchImpl });
}

export async function listRequests(
  id: string,
  fetchImpl?: typeof fetch,
): Promise<{ requests: PendingRequestDTO[] }> {
  return request<{ requests: PendingRequestDTO[] }>(`/api/conversations/${id}/requests`, {
    fetchImpl,
  });
}

export async function replyPermission(
  id: string,
  requestId: string,
  payload: PermissionRequestReplyInput,
  fetchImpl?: typeof fetch,
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
  fetchImpl?: typeof fetch,
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
  fetchImpl?: typeof fetch,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/conversations/${id}/questions/${requestId}/reject`, {
    method: "POST",
    fetchImpl,
  });
}

export async function listOutputFiles(
  id: string,
  prefix?: string,
  fetchImpl?: typeof fetch,
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
  fetchImpl?: typeof fetch,
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
  fetchImpl?: typeof fetch,
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

export async function listAdminInstances(fetchImpl?: typeof fetch): Promise<ListInstancesResponse> {
  return request<ListInstancesResponse>("/api/admin/instances", { fetchImpl });
}

export async function forceTeardownInstance(
  userId: string,
  fetchImpl?: typeof fetch,
): Promise<SuccessResponse> {
  return request<SuccessResponse>(`/api/admin/instances/${userId}`, {
    method: "DELETE",
    fetchImpl,
  });
}
