import type { PendingRequestDTO } from "@kepler-chat/contracts";
import type { MessageView } from "./chat-types";

export function upsertMessageList(messages: MessageView[], message: MessageView): MessageView[] {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index === -1) {
    return [...messages, message];
  }

  const next = [...messages];
  next[index] = message;
  return next;
}

export function appendDeltaToMessage(
  messages: MessageView[],
  messageId: string,
  delta: string,
): MessageView[] {
  const index = messages.findIndex((item) => item.id === messageId);
  if (index === -1) {
    return messages;
  }

  const next = [...messages];
  next[index] = {
    ...next[index],
    text: `${next[index].text}${delta}`,
  };
  return next;
}

export interface ConversationRuntimeState {
  pendingRequests: PendingRequestDTO[];
  isStreaming: boolean;
  lastError: string | null;
}

export function resetConversationRuntimeState(): ConversationRuntimeState {
  return {
    pendingRequests: [],
    isStreaming: false,
    lastError: null,
  };
}
