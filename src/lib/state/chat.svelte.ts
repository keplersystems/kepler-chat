import type { PendingRequestDTO, SendMessageInput } from "$lib/contracts";
import { invalidateAll } from "$app/navigation";
import { parseSSEStream } from "$lib/sse";
import {
  extractTokens,
  getRequestId,
  isTerminalFinish,
  toToolCallView,
  type MessageView,
  type ToolCallView,
} from "$lib/messages";

export type { MessageView, MessageTokens, ToolCallView } from "$lib/messages";
export { toMessageViewList } from "$lib/messages";

interface StreamingMessage extends MessageView {
  toolCallsById: Record<string, ToolCallView>;
}

function emptyMessage(id: string, role: MessageView["role"]): StreamingMessage {
  return { id, role, text: "", reasoning: "", toolCallsById: {}, toolCalls: [] };
}

function shouldEmit(msg: StreamingMessage): boolean {
  if (msg.text.trim().length > 0) return true;
  if ((msg.reasoning ?? "").trim().length > 0) return true;
  if (Object.keys(msg.toolCallsById).length > 0) return true;
  return isTerminalFinish(msg.finish);
}

function toMessageView(msg: StreamingMessage): MessageView {
  return { ...msg, toolCalls: Object.values(msg.toolCallsById) };
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

  function writeStreaming(conversationId: string, messages: MessageView[]) {
    streamingByConversation = { ...streamingByConversation, [conversationId]: messages };
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

    const messages = new Map<string, StreamingMessage>();
    let lastTitle: string | null = null;

    const userEcho: StreamingMessage = {
      ...emptyMessage(crypto.randomUUID(), "user"),
      text:
        input.text +
        (input.attachments?.length
          ? `\n\n[Attached ${input.attachments.length} file(s)]`
          : ""),
    };

    const flush = () => {
      const visible: MessageView[] = [toMessageView(userEcho)];
      for (const msg of messages.values()) {
        // Server-side user messages are tracked for metadata (title) but not echoed —
        // the local userEcho already represents the user's submission until invalidateAll().
        if (msg.role === "user") continue;
        if (shouldEmit(msg)) visible.push(toMessageView(msg));
      }
      writeStreaming(conversationId, visible);
    };
    flush();

    const ensureMessage = (id: string, role: MessageView["role"]): StreamingMessage => {
      const existing = messages.get(id);
      if (existing) {
        if (existing.role !== role) existing.role = role;
        return existing;
      }
      const created = emptyMessage(id, role);
      messages.set(id, created);
      return created;
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

          const msg = ensureMessage(id, role);
          msg.finish = data.info?.finish;
          msg.modelID = data.info?.modelID;
          msg.providerID = data.info?.providerID;
          msg.tokens = extractTokens(data.info?.tokens);
          msg.createdAt =
            typeof data.info?.time?.created === "number" ? data.info.time.created : undefined;
        } else if (env.event === "message.part.updated") {
          const data = env.data as {
            delta?: string;
            part?: {
              messageID?: string;
              type?: string;
              text?: string;
              id?: string;
              callID?: string;
              tool?: string;
              state?: { status?: ToolCallView["status"]; input?: unknown; output?: string; error?: string };
            };
          };
          const part = data.part;
          const id = part?.messageID;
          if (!id || !part) continue;
          const msg = messages.get(id);
          if (!msg) continue;

          if (part.type === "text") {
            if (typeof data.delta === "string" && data.delta.length > 0) {
              msg.text += data.delta;
            } else if (typeof part.text === "string") {
              msg.text = part.text;
            }
          } else if (part.type === "reasoning") {
            if (typeof data.delta === "string" && data.delta.length > 0) {
              msg.reasoning = (msg.reasoning ?? "") + data.delta;
            } else if (typeof part.text === "string") {
              msg.reasoning = part.text;
            }
          } else if (part.type === "tool") {
            const tool = toToolCallView(part, `tool-${Date.now()}`);
            msg.toolCallsById[tool.id] = { ...msg.toolCallsById[tool.id], ...tool };
          } else {
            continue;
          }
        } else if (env.event === "message.part.delta") {
          const data = env.data as { id?: string; messageID?: string; delta?: string };
          const id = data.messageID ?? data.id;
          if (!id || !data.delta) continue;
          const msg = messages.get(id);
          if (!msg) continue;
          msg.text += data.delta;
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
          const msg = messages.get(data.messageID);
          if (!msg) continue;
          const cmdId = `cmd:${data.name}:${data.arguments ?? ""}`;
          msg.toolCallsById[cmdId] = {
            id: cmdId,
            name: data.name,
            status: "executed",
            input: data.arguments,
          };
        } else if (env.event === "error") {
          const data = env.data as { message?: string };
          throw new Error(data.message ?? "Stream error");
        }

        flush();
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
