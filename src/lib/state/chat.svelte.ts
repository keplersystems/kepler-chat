import type { PendingRequestDTO, SendMessageInput } from "$lib/contracts";
import { invalidateAll } from "$app/navigation";
import { parseSSEStream } from "$lib/sse";
import { api, downloadFileUrl } from "$lib/api";
import type { MessageView } from "$lib/messages";
import { createMessageStream } from "$lib/state/stream";
import { notifyRunFinished } from "$lib/notifications";
import type { Todo } from "@opencode-ai/sdk/v2";

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

  function streamEffects(conversationId: string, onTitle?: (title: string) => void) {
    return {
      onTitle,
      onRequestAsked: upsertPendingRequest,
      onRequestSettled: removePendingRequest,
      onTodos: (todos: Todo[]) => {
        todosByConversation = { ...todosByConversation, [conversationId]: todos };
      },
      onSessionError: setError,
    };
  }

  /** Consume an SSE body through the reducer, then refresh and clean up. */
  async function runStream(
    conversationId: string,
    controller: AbortController,
    stream: ReturnType<typeof createMessageStream>,
    openBody: () => Promise<ReadableStream<Uint8Array>>,
  ): Promise<boolean> {
    let succeeded = false;
    const flush = () => writeStreaming(conversationId, stream.visible());

    try {
      const body = await openBody();
      for await (const env of parseSSEStream(body)) {
        if (env.event === "error") {
          throw new Error(env.data.message);
        }
        stream.apply(env);
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
      notifyRunFinished(succeeded);
      try {
        await invalidateAll();
      } finally {
        clearStreaming(conversationId);
      }
    }

    return succeeded;
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

    const stream = createMessageStream(
      input,
      (path) => downloadFileUrl(conversationId, path, "input"),
      streamEffects(conversationId, onTitle),
    );
    writeStreaming(conversationId, stream.visible());

    return runStream(conversationId, controller, stream, async () => {
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
      return response.body;
    });
  }

  /** Reattach to a generation started before this page/tab loaded, if any. */
  async function attach(
    conversationId: string,
    onTitle?: (title: string) => void,
  ): Promise<void> {
    if (controllers.has(conversationId)) return;
    const controller = new AbortController();

    let response: Response;
    try {
      response = await fetch(`/api/conversations/${conversationId}/messages/live`, {
        credentials: "include",
        signal: controller.signal,
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    if (response.status === 204) return;
    if (!response.ok || !response.body) {
      setError(`Failed to attach to stream (${response.status})`);
      return;
    }

    const body = response.body;
    controllers.set(conversationId, controller);
    setStreamActive(conversationId, true);
    const stream = createMessageStream(null, () => "", streamEffects(conversationId, onTitle));
    await runStream(conversationId, controller, stream, async () => body);
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
    attach,
    stop,
    reset,
  };
}

export const chat = createChatStore();
