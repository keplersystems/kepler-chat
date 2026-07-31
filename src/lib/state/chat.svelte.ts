import { downloadFileUrl } from "$lib/contracts";
import type {
  AgentCommand,
  MessageView,
  PendingRequestDTO,
  PlanEntry,
  SendMessageInput,
  SessionConfigDTO,
  SessionUsageDTO,
} from "$lib/contracts";
import { invalidateAll } from "$app/navigation";
import { parseSSEStream } from "$lib/sse";
import { api } from "$lib/api";
import { createMessageStream } from "$lib/state/stream";
import { notifyRunFinished } from "$lib/notifications";

function createChatStore() {
  let pendingRequests = $state<PendingRequestDTO[]>([]);
  let lastError = $state<string | null>(null);
  let streamingByConversation = $state<Record<string, MessageView[]>>({});
  let activeStreams = $state<Record<string, true>>({});
  let planByConversation = $state<Record<string, PlanEntry[]>>({});
  let usageByConversation = $state<Record<string, SessionUsageDTO>>({});
  let configByConversation = $state<Record<string, SessionConfigDTO>>({});
  let commandsByConversation = $state<Record<string, AgentCommand[]>>({});

  const controllers = new Map<string, AbortController>();

  function streamingMessagesFor(conversationId: string): MessageView[] {
    return streamingByConversation[conversationId] ?? [];
  }

  function isStreamingFor(conversationId: string): boolean {
    return conversationId in activeStreams;
  }

  function planFor(conversationId: string): PlanEntry[] {
    return planByConversation[conversationId] ?? [];
  }

  function usageFor(conversationId: string): SessionUsageDTO | null {
    return usageByConversation[conversationId] ?? null;
  }

  function configFor(conversationId: string): SessionConfigDTO | null {
    return configByConversation[conversationId] ?? null;
  }

  function setConfig(conversationId: string, config: SessionConfigDTO) {
    configByConversation = { ...configByConversation, [conversationId]: config };
  }

  function commandsFor(conversationId: string): AgentCommand[] {
    return commandsByConversation[conversationId] ?? [];
  }

  function setCommands(conversationId: string, commands: AgentCommand[]) {
    commandsByConversation = { ...commandsByConversation, [conversationId]: commands };
  }

  async function loadCommands(conversationId: string) {
    const { data } = await api.api.conversations({ id: conversationId }).commands.get();
    if (data) setCommands(conversationId, data.commands);
  }

  function setUsage(conversationId: string, usage: SessionUsageDTO) {
    usageByConversation = { ...usageByConversation, [conversationId]: usage };
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

  function setError(message: string | null) {
    lastError = message;
  }

  function setPendingRequests(next: PendingRequestDTO[]) {
    pendingRequests = next;
  }

  function upsertPendingRequest(request: PendingRequestDTO) {
    const idx = pendingRequests.findIndex(
      (entry) => entry.request.requestId === request.request.requestId,
    );
    if (idx === -1) pendingRequests = [...pendingRequests, request];
    else pendingRequests = pendingRequests.with(idx, request);
  }

  function removePendingRequest(requestId: string) {
    pendingRequests = pendingRequests.filter((entry) => entry.request.requestId !== requestId);
  }

  /** Abort the running stream and ask the agent to stop generating. */
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
      onPlan: (entries: PlanEntry[]) => {
        planByConversation = { ...planByConversation, [conversationId]: entries };
      },
      onUsage: (usage: SessionUsageDTO) => setUsage(conversationId, usage),
      onConfig: (config: SessionConfigDTO) => setConfig(conversationId, config),
      onCommands: (commands: AgentCommand[]) => setCommands(conversationId, commands),
      onError: setError,
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
      const next = { ...planByConversation };
      delete next[conversationId];
      planByConversation = next;
      notifyRunFinished(succeeded);
      try {
        await invalidateAll();
      } finally {
        clearStreaming(conversationId);
      }
    }

    return succeeded;
  }

  /** Open a turn endpoint and render its SSE body, echoing the submission meanwhile. */
  async function startTurn(
    conversationId: string,
    echoParts: MessageView["parts"],
    path: string,
    body: unknown,
    onTitle?: (title: string) => void,
  ): Promise<boolean> {
    setError(null);
    setStreamActive(conversationId, true);
    const controller = new AbortController();
    controllers.set(conversationId, controller);

    const stream = createMessageStream(streamEffects(conversationId, onTitle), {
      id: "echo",
      role: "user",
      parts: echoParts,
      createdAt: Date.now(),
    });
    writeStreaming(conversationId, stream.visible());

    return runStream(conversationId, controller, stream, async () => {
      const response = await fetch(`/api/conversations/${conversationId}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Stream failed (${response.status})`);
      }
      void invalidateAll();
      return response.body;
    });
  }

  function send(
    conversationId: string,
    input: SendMessageInput,
    onTitle?: (title: string) => void,
  ): Promise<boolean> {
    const echoParts: MessageView["parts"] = [];
    if (input.text.trim()) {
      echoParts.push({ id: "echo-text", type: "text", text: input.text.trim() });
    }
    for (const [i, attachment] of (input.attachments ?? []).entries()) {
      echoParts.push({
        id: `echo-file-${i}`,
        type: "file",
        url: downloadFileUrl(conversationId, attachment.path, "input"),
        filename: attachment.filename ?? attachment.path,
        mimeType: attachment.mimeType,
      });
    }
    return startTurn(conversationId, echoParts, "messages", input, onTitle);
  }

  /** Run an agent-advertised slash command as a turn. */
  function runCommand(
    conversationId: string,
    name: string,
    args?: string,
    onTitle?: (title: string) => void,
  ): Promise<boolean> {
    const text = args?.trim() ? `/${name} ${args.trim()}` : `/${name}`;
    return startTurn(
      conversationId,
      [{ id: "echo-text", type: "text", text }],
      "commands",
      { name, args },
      onTitle,
    );
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
    const stream = createMessageStream(streamEffects(conversationId, onTitle));
    await runStream(conversationId, controller, stream, async () => body);
  }

  return {
    get pendingRequests() {
      return pendingRequests;
    },
    get lastError() {
      return lastError;
    },
    isStreamingFor,
    planFor,
    usageFor,
    configFor,
    setConfig,
    setUsage,
    commandsFor,
    loadCommands,
    streamingMessagesFor,
    setPendingRequests,
    removePendingRequest,
    setError,
    send,
    runCommand,
    attach,
    stop,
  };
}

export const chat = createChatStore();
