import type { PendingRequestDTO, SendMessageInput } from "$lib/contracts";
import { invalidateAll } from "$app/navigation";
import { parseSSEStream } from "$lib/sse";
import { api, downloadFileUrl } from "$lib/api";
import {
  applyMessageInfo,
  hasVisibleContent,
  isRealSessionTitle,
  toPartView,
  type MessageView,
  type PartView,
} from "$lib/messages";
import type { Part, Todo } from "@opencode-ai/sdk/v2";
import { settings } from "$lib/state/settings.svelte";

export type { MessageView, MessageTokens, PartView } from "$lib/messages";
export { toMessageViewList, messageText } from "$lib/messages";

interface StreamingMessage extends MessageView {
  /** part id -> index into parts, for O(1) streaming upserts */
  partIndex: Map<string, number>;
}

function emptyMessage(id: string, role: MessageView["role"]): StreamingMessage {
  return { id, role, parts: [], partIndex: new Map() };
}

function toMessageView(msg: StreamingMessage): MessageView {
  const { partIndex: _, ...view } = msg;
  return { ...view, parts: [...msg.parts] };
}

function upsertPart(msg: StreamingMessage, part: Part): void {
  const view = toPartView(part);
  if (!view) return;
  const idx = msg.partIndex.get(part.id);
  if (idx === undefined) {
    msg.partIndex.set(part.id, msg.parts.length);
    msg.parts.push(view);
  } else {
    msg.parts[idx] = view;
  }
}

function appendPart(msg: StreamingMessage, view: PartView): void {
  msg.partIndex.set(view.id, msg.parts.length);
  msg.parts.push(view);
}

function removePart(msg: StreamingMessage, partId: string): void {
  const idx = msg.partIndex.get(partId);
  if (idx === undefined) return;
  msg.parts.splice(idx, 1);
  msg.partIndex.delete(partId);
  for (const [id, i] of msg.partIndex) {
    if (i > idx) msg.partIndex.set(id, i - 1);
  }
}

function createChatStore() {
  let pendingRequests = $state<PendingRequestDTO[]>([]);
  let lastError = $state<string | null>(null);
  let streamingByConversation = $state<Record<string, MessageView[]>>({});
  let activeStreams = $state<Record<string, true>>({});
  let todosByConversation = $state<Record<string, Todo[]>>({});

  const controllers = new Map<string, AbortController>();

  function streamingMessagesFor(conversationId: string): MessageView[] {
    return streamingByConversation[conversationId] ?? [];
  }

  function isStreamingFor(conversationId: string): boolean {
    return conversationId in activeStreams;
  }

  function todosFor(conversationId: string): Todo[] {
    return todosByConversation[conversationId] ?? [];
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

  function setStreamActive(conversationId: string, active: boolean) {
    const next = { ...activeStreams };
    if (active) next[conversationId] = true;
    else delete next[conversationId];
    activeStreams = next;
  }

  function reset() {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    pendingRequests = [];
    lastError = null;
    streamingByConversation = {};
    activeStreams = {};
    todosByConversation = {};
  }

  function setError(message: string | null) {
    lastError = message;
  }

  function setPendingRequests(next: PendingRequestDTO[]) {
    pendingRequests = next;
  }

  function upsertPendingRequest(request: PendingRequestDTO) {
    const idx = pendingRequests.findIndex(
      (r) => r.type === request.type && r.request.id === request.request.id,
    );
    if (idx === -1) {
      pendingRequests = [...pendingRequests, request];
      return;
    }
    pendingRequests = pendingRequests.with(idx, request);
  }

  function removePendingRequest(requestId: string) {
    pendingRequests = pendingRequests.filter((r) => r.request.id !== requestId);
  }

  /** Abort the running stream and ask OpenCode to stop generating. */
  function stop(conversationId: string) {
    const controller = controllers.get(conversationId);
    if (!controller) return;
    controller.abort();
    void api.api.conversations({ id: conversationId }).abort.post();
  }

  async function send(
    conversationId: string,
    input: SendMessageInput,
    onTitle?: (title: string) => void,
  ): Promise<boolean> {
    setError(null);
    setStreamActive(conversationId, true);
    const controller = new AbortController();
    controllers.set(conversationId, controller);
    let succeeded = false;

    const messages = new Map<string, StreamingMessage>();
    let lastTitle: string | null = null;

    const userEcho = emptyMessage(crypto.randomUUID(), "user");
    if (input.text.trim().length > 0) {
      appendPart(userEcho, { type: "text", id: "echo-text", text: input.text });
    }
    for (const [i, attachment] of (input.attachments ?? []).entries()) {
      appendPart(userEcho, {
        type: "file",
        id: `echo-file-${i}`,
        mime: attachment.mimeType ?? "application/octet-stream",
        filename: attachment.filename ?? attachment.path,
        url: downloadFileUrl(conversationId, attachment.path, "input"),
      });
    }

    const flush = () => {
      const visible: MessageView[] = [toMessageView(userEcho)];
      for (const msg of messages.values()) {
        // Server-side user messages are tracked for metadata (title) but not echoed —
        // the local userEcho already represents the user's submission until invalidateAll().
        if (msg.role === "user") continue;
        if (hasVisibleContent(msg)) visible.push(toMessageView(msg));
      }
      writeStreaming(conversationId, visible);
    };
    flush();

    const ensureMessage = (id: string, role: MessageView["role"]): StreamingMessage => {
      const existing = messages.get(id);
      if (existing) return existing;
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
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? `Stream failed (${response.status})`);
      }
      void invalidateAll();

      for await (const env of parseSSEStream(response.body)) {
        switch (env.event) {
          case "message.updated": {
            const info = env.data.info;
            if (info.role === "user") {
              // Adopt the server's id so pages can dedup the echo against
              // persisted messages once loads re-run mid-stream.
              userEcho.id = info.id;
              const title = info.summary?.title?.trim();
              if (title && title !== lastTitle) {
                lastTitle = title;
                onTitle?.(title);
              }
            }
            const msg = ensureMessage(info.id, info.role);
            applyMessageInfo(msg, info);
            break;
          }
          case "message.removed": {
            messages.delete(env.data.messageID);
            break;
          }
          case "session.updated": {
            const title = env.data.info.title?.trim();
            if (isRealSessionTitle(title) && title !== lastTitle) {
              lastTitle = title;
              onTitle?.(title);
            }
            break;
          }
          case "message.part.updated": {
            const part = env.data.part;
            // Parts can arrive before their message.updated; role is corrected
            // by the message event, and user-role messages are never emitted.
            const msg = ensureMessage(part.messageID, "assistant");
            upsertPart(msg, part);
            break;
          }
          case "message.part.delta": {
            const { messageID, partID, field, delta } = env.data;
            if (field !== "text") break;
            const msg = messages.get(messageID);
            if (!msg) break;
            const idx = msg.partIndex.get(partID);
            if (idx === undefined) break;
            const part = msg.parts[idx];
            if (part.type !== "text" && part.type !== "reasoning") break;
            msg.parts[idx] = { ...part, text: part.text + delta };
            break;
          }
          case "message.part.removed": {
            const msg = messages.get(env.data.messageID);
            if (msg) removePart(msg, env.data.partID);
            break;
          }
          case "permission.asked": {
            upsertPendingRequest({ type: "permission", request: env.data });
            break;
          }
          case "question.asked": {
            upsertPendingRequest({ type: "question", request: env.data });
            break;
          }
          case "permission.replied":
          case "question.replied":
          case "question.rejected": {
            removePendingRequest(env.data.requestID);
            break;
          }
          case "todo.updated": {
            todosByConversation = {
              ...todosByConversation,
              [conversationId]: env.data.todos,
            };
            break;
          }
          case "command.executed": {
            const msg = messages.get(env.data.messageID);
            if (!msg) break;
            appendPart(msg, {
              type: "command",
              id: `cmd:${env.data.name}:${env.data.arguments}`,
              name: env.data.name,
              args: env.data.arguments,
            });
            break;
          }
          case "error":
            throw new Error(env.data.message);
        }

        flush();
      }
      succeeded = true;
    } catch (err) {
      const aborted =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError");
      if (!aborted) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    } finally {
      controllers.delete(conversationId);
      setStreamActive(conversationId, false);
      if (
        settings.notifyCompletions &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.visibilityState === "hidden"
      ) {
        const notification = new Notification("Kepler", {
          body: succeeded ? "Response finished" : "Run stopped with an error",
        });
        notification.onclick = () => window.focus();
      }
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
      return Object.keys(activeStreams).length > 0;
    },
    get lastError() {
      return lastError;
    },
    isStreamingFor,
    todosFor,
    streamingMessagesFor,
    setPendingRequests,
    upsertPendingRequest,
    removePendingRequest,
    setError,
    send,
    stop,
    reset,
  };
}

export const chat = createChatStore();
