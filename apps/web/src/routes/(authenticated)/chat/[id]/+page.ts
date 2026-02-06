import type { PageLoad } from "./$types";
import {
  getConversation,
  listConversations,
  listMessages,
  listRequests,
} from "$lib/api/chat";

export const load: PageLoad = async ({ fetch, params }) => {
  const conversationId = params.id;

  const [conversations, conversation, messages, requests] = await Promise.all([
    listConversations(fetch),
    getConversation(conversationId, fetch),
    listMessages(conversationId, fetch),
    listRequests(conversationId, fetch),
  ]);

  return {
    conversations,
    conversation,
    messages,
    requests: requests.requests,
  };
};
