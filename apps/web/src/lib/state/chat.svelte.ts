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
    setStreaming,
    setError,
    resetConversationState,
  };
}
