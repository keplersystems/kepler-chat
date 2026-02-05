import type { PageLoad } from "./$types";
import {
  getConversation,
  listMessages,
  listRequests,
} from "$lib/api/chat";

export const load: PageLoad = async ({ fetch, params }) => {
  const conversationId = params.id;

  const [conversation, messages, requests] = await Promise.all([
    getConversation(conversationId, fetch),
    listMessages(conversationId, fetch),
    listRequests(conversationId, fetch),
  ]);

  return {
    conversation,
    messages,
    requests: requests.requests,
  };
};
