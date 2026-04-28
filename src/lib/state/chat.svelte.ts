import type { PendingRequestDTO, SendMessageInput } from "$lib/contracts";
import { invalidateAll } from "$app/navigation";
import { parseSSEStream } from "$lib/sse";
import {
  isTerminalFinish,
  type MessageTokens,
  type MessageView,
  type ToolCallView,
} from "$lib/messages";

export type { MessageView, MessageTokens, ToolCallView } from "$lib/messages";
export { toMessageViewList } from "$lib/messages";

interface StreamingInfo {
  modelID?: string;
  providerID?: string;
  tokens?: MessageTokens;
  createdAt?: number;
}

function getRequestId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { id?: unknown; requestID?: unknown; requestId?: unknown };
  if (typeof obj.id === "string" && obj.id.length > 0) return obj.id;
  if (typeof obj.requestID === "string" && obj.requestID.length > 0) return obj.requestID;
  if (typeof obj.requestId === "string" && obj.requestId.length > 0) return obj.requestId;
  return null;
}

function createChatStore() {
  let pendingRequests = $state<PendingRequestDTO[]>([]);
  let isStreaming = $state(false);
  let lastError = $state<string | null>(null);
  let streamingByConversation = $state<Record<string, MessageView[]>>({});

  function streamingMessagesFor(conversationId: string): MessageView[] {
    return streamingByConversation[conversationId] ?? [];
  }

  function clearStreaming(conversationId: string) {
    if (!(conversationId in streamingByConversation)) return;
    const next = { ...streamingByConversation };
    delete next[conversationId];
    streamingByConversation = next;
  }

  function upsertStreaming(conversationId: string, message: MessageView) {
    const list = streamingByConversation[conversationId] ?? [];
    const idx = list.findIndex((m) => m.id === message.id);
    const next = idx === -1 ? [...list, message] : list.with(idx, message);
    streamingByConversation = { ...streamingByConversation, [conversationId]: next };
  }

  function reset() {
    pendingRequests = [];
    isStreaming = false;
    lastError = null;
    streamingByConversation = {};
  }

  function setError(message: string | null) {
    lastError = message;
  }

  function setPendingRequests(next: PendingRequestDTO[]) {
    pendingRequests = next;
  }

  function upsertPendingRequest(request: PendingRequestDTO) {
    const nextId = getRequestId(request.request);
    const idx = pendingRequests.findIndex(
      (r) => r.type === request.type && getRequestId(r.request) === nextId,
    );
    if (idx === -1) {
      pendingRequests = [...pendingRequests, request];
      return;
    }
    pendingRequests = pendingRequests.with(idx, request);
  }

  function removePendingRequest(requestId: string) {
    pendingRequests = pendingRequests.filter(
      (r) => getRequestId(r.request) !== requestId,
    );
  }

  async function send(
    conversationId: string,
    input: SendMessageInput,
    onTitle?: (title: string) => void,
  ): Promise<boolean> {
    setError(null);
    isStreaming = true;
    let succeeded = false;

    const userEcho: MessageView = {
      id: crypto.randomUUID(),
      role: "user",
      text:
        input.text +
        (input.attachments?.length
          ? `\n\n[Attached ${input.attachments.length} file(s)]`
          : ""),
    };
    upsertStreaming(conversationId, userEcho);

    const roleById = new Map<string, MessageView["role"]>();
    const textById = new Map<string, string>();
    const reasoningById = new Map<string, string>();
    const toolsById = new Map<string, Map<string, ToolCallView>>();
    const finishById = new Map<string, string | undefined>();
    const infoById = new Map<string, StreamingInfo>();
    let lastTitle: string | null = null;

    const extractTokens = (raw: unknown): MessageTokens | undefined => {
      if (!raw || typeof raw !== "object") return undefined;
      const t = raw as {
        total?: number;
        input?: number;
        output?: number;
        reasoning?: number;
        cache?: { read?: number; write?: number };
      };
      const input = typeof t.input === "number" ? t.input : undefined;
      const output = typeof t.output === "number" ? t.output : undefined;
      const reasoning = typeof t.reasoning === "number" ? t.reasoning : undefined;
      const cacheRead = typeof t.cache?.read === "number" ? t.cache.read : undefined;
      const cacheWrite = typeof t.cache?.write === "number" ? t.cache.write : undefined;
      const total =
        typeof t.total === "number"
          ? t.total
          : input !== undefined || output !== undefined
            ? (input ?? 0) + (output ?? 0)
            : undefined;
      if (
        input === undefined &&
        output === undefined &&
        reasoning === undefined &&
        cacheRead === undefined &&
        cacheWrite === undefined &&
        total === undefined
      ) {
        return undefined;
      }
      return { input, output, reasoning, cacheRead, cacheWrite, total };
    };

    const shouldEmit = (id: string): boolean => {
      if ((textById.get(id) ?? "").trim().length > 0) return true;
      if ((reasoningById.get(id) ?? "").trim().length > 0) return true;
      const tc = toolsById.get(id);
      if (tc && tc.size > 0) return true;
      return isTerminalFinish(finishById.get(id));
    };

    const emit = (id: string, role: MessageView["role"]) => {
      const info = infoById.get(id);
      upsertStreaming(conversationId, {
        id,
        role,
        text: textById.get(id) ?? "",
        reasoning: reasoningById.get(id) ?? "",
        toolCalls: Array.from((toolsById.get(id) ?? new Map()).values()),
        finish: finishById.get(id),
        modelID: info?.modelID,
        providerID: info?.providerID,
        tokens: info?.tokens,
        createdAt: info?.createdAt,
      });
    };

    const upsertTool = (id: string, tool: ToolCallView) => {
      const map = toolsById.get(id) ?? new Map<string, ToolCallView>();
      const existing = map.get(tool.id);
      map.set(tool.id, { ...(existing ?? {}), ...tool });
      toolsById.set(id, map);
    };

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? `Stream failed (${response.status})`);
      }

      for await (const env of parseSSEStream(response.body)) {
        if (env.event === "message.updated") {
          const data = env.data as {
            info?: {
              id?: string;
              role?: string;
              finish?: string;
              summary?: { title?: string };
              modelID?: string;
              providerID?: string;
              tokens?: unknown;
              time?: { created?: number };
            };
          };
          const id = data.info?.id;
          const role = data.info?.role;
          if (!id || (role !== "user" && role !== "assistant" && role !== "system")) continue;

          if (role === "user") {
            const t = data.info?.summary?.title?.trim();
            if (t && t !== lastTitle) {
              lastTitle = t;
              onTitle?.(t);
            }
          }

          roleById.set(id, role);
          if (!textById.has(id)) textById.set(id, "");
          if (!toolsById.has(id)) toolsById.set(id, new Map());
          finishById.set(id, data.info?.finish);
          infoById.set(id, {
            modelID: data.info?.modelID,
            providerID: data.info?.providerID,
            tokens: extractTokens(data.info?.tokens),
            createdAt:
              typeof data.info?.time?.created === "number" ? data.info.time.created : undefined,
          });

          if ((role === "assistant" || role === "system") && shouldEmit(id)) emit(id, role);
        } else if (env.event === "message.part.updated") {
          const data = env.data as {
            delta?: string;
            part?: { messageID?: string; type?: string; text?: string };
          };
          const id = data.part?.messageID;
          if (!id) continue;

          if (data.part?.type === "text") {
            if (typeof data.delta === "string" && data.delta.length > 0) {
              textById.set(id, `${textById.get(id) ?? ""}${data.delta}`);
            } else if (typeof data.part.text === "string") {
              textById.set(id, data.part.text);
            }
          } else if (data.part?.type === "reasoning") {
            if (typeof data.delta === "string" && data.delta.length > 0) {
              reasoningById.set(id, `${reasoningById.get(id) ?? ""}${data.delta}`);
            } else if (typeof data.part.text === "string") {
              reasoningById.set(id, data.part.text);
            }
          } else if (data.part?.type === "tool") {
            const tp = data.part as {
              id?: string;
              callID?: string;
              tool?: string;
              state?: {
                status?: ToolCallView["status"];
                input?: unknown;
                output?: string;
                error?: string;
              };
            };
            const toolId = tp.callID ?? tp.id ?? `tool-${Date.now()}`;
            upsertTool(id, {
              id: toolId,
              name: tp.tool ?? "tool",
              status: tp.state?.status ?? "running",
              input: tp.state?.input !== undefined ? JSON.stringify(tp.state.input) : undefined,
              output: tp.state?.output,
              error: tp.state?.error,
            });
          } else continue;

          const role = roleById.get(id);
          if ((role === "assistant" || role === "system") && shouldEmit(id)) emit(id, role);
        } else if (env.event === "message.part.delta") {
          const data = env.data as { id?: string; messageID?: string; delta?: string };
          const id = data.messageID ?? data.id;
          if (!id || !data.delta) continue;
          textById.set(id, `${textById.get(id) ?? ""}${data.delta}`);
          const role = roleById.get(id);
          if ((role === "assistant" || role === "system") && shouldEmit(id)) emit(id, role);
        } else if (env.event === "permission.asked") {
          upsertPendingRequest({ type: "permission", request: env.data });
        } else if (env.event === "question.asked") {
          upsertPendingRequest({ type: "question", request: env.data });
        } else if (
          env.event === "permission.replied" ||
          env.event === "question.replied" ||
          env.event === "question.rejected"
        ) {
          const id = getRequestId(env.data);
          if (id) removePendingRequest(id);
        } else if (env.event === "command.executed") {
          const data = env.data as { name?: string; arguments?: string; messageID?: string };
          if (!data.messageID || !data.name) continue;
          const cmdId = `cmd:${data.name}:${data.arguments ?? ""}`;
          upsertTool(data.messageID, {
            id: cmdId,
            name: data.name,
            status: "executed",
            input: data.arguments,
          });
          const role = roleById.get(data.messageID);
          if ((role === "assistant" || role === "system") && shouldEmit(data.messageID)) {
            emit(data.messageID, role);
          }
        } else if (env.event === "error") {
          const data = env.data as { message?: string };
          throw new Error(data.message ?? "Stream error");
        }
      }
      succeeded = true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      isStreaming = false;
      try {
        await invalidateAll();
      } finally {
        clearStreaming(conversationId);
      }
    }

    return succeeded;
  }

  return {
    get pendingRequests() {
      return pendingRequests;
    },
    get isStreaming() {
      return isStreaming;
    },
    get lastError() {
      return lastError;
    },
    streamingMessagesFor,
    setPendingRequests,
    upsertPendingRequest,
    removePendingRequest,
    setError,
    send,
    reset,
  };
}

export const chat = createChatStore();
