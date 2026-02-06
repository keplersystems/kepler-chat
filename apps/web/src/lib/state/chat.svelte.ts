import type { ConversationDTO, PendingRequestDTO } from "@kepler-chat/contracts";
import type { MessageView } from "./chat-types";
import { appendDeltaToMessage, resetConversationRuntimeState, upsertMessageList } from "./chat-reducer";

export function createChatState() {
  let conversations = $state<ConversationDTO[]>([]);
  let currentConversationId = $state<string | null>(null);
  let messagesByConversation = $state<Record<string, MessageView[]>>({});
  let pendingRequests = $state<PendingRequestDTO[]>([]);
  let isStreaming = $state(false);
  let lastError = $state<string | null>(null);

  function setConversations(next: ConversationDTO[]) {
    conversations = next;
  }

  function setCurrentConversation(id: string | null) {
    currentConversationId = id;
  }

  function setMessages(conversationId: string, next: MessageView[]) {
    messagesByConversation[conversationId] = next;
  }

  function upsertMessage(conversationId: string, message: MessageView) {
    const current = messagesByConversation[conversationId] ?? [];
    messagesByConversation[conversationId] = upsertMessageList(current, message);
  }

  function appendDelta(conversationId: string, messageId: string, delta: string) {
    const current = messagesByConversation[conversationId] ?? [];
    messagesByConversation[conversationId] = appendDeltaToMessage(current, messageId, delta);
  }

  function setPendingRequests(next: PendingRequestDTO[]) {
    pendingRequests = next;
  }

  function getPendingRequestId(request: PendingRequestDTO): string | null {
    const payload = request.request as { id?: unknown; requestID?: unknown; requestId?: unknown };
    if (typeof payload?.id === "string" && payload.id.length > 0) return payload.id;
    if (typeof payload?.requestID === "string" && payload.requestID.length > 0) return payload.requestID;
    if (typeof payload?.requestId === "string" && payload.requestId.length > 0) return payload.requestId;
    return null;
  }

  function upsertPendingRequest(nextRequest: PendingRequestDTO) {
    const nextId = getPendingRequestId(nextRequest);
    const index = pendingRequests.findIndex((request) => {
      if (request.type !== nextRequest.type) return false;
      const id = getPendingRequestId(request);
      return id !== null && id === nextId;
    });

    if (index === -1) {
      pendingRequests = [...pendingRequests, nextRequest];
      return;
    }

    const next = [...pendingRequests];
    next[index] = nextRequest;
    pendingRequests = next;
  }

  function removePendingRequest(requestId: string) {
    pendingRequests = pendingRequests.filter((request) => {
      const id = getPendingRequestId(request);
      return id !== requestId;
    });
  }

  function setStreaming(value: boolean) {
    isStreaming = value;
  }

  function setError(message: string | null) {
    lastError = message;
  }

  function resetConversationState(conversationId: string) {
    const resetState = resetConversationRuntimeState();
    messagesByConversation[conversationId] = [];
    pendingRequests = resetState.pendingRequests;
    isStreaming = resetState.isStreaming;
    lastError = resetState.lastError;
  }

  return {
    get conversations() {
      return conversations;
    },
    get currentConversationId() {
      return currentConversationId;
    },
    get messagesByConversation() {
      return messagesByConversation;
    },
    get pendingRequests() {
      return pendingRequests;
    },
    get isStreaming() {
      return isStreaming;
    },
    get lastError() {
      return lastError;
    },
    setConversations,
    setCurrentConversation,
    setMessages,
    upsertMessage,
    appendDelta,
    setPendingRequests,
    upsertPendingRequest,
    removePendingRequest,
    setStreaming,
    setError,
    resetConversationState,
  };
}
