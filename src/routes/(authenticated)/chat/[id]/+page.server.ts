import { error } from "@sveltejs/kit";
import { serverApi } from "$lib/api";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, params, url }) => {
  const api = serverApi(fetch, url.origin);
  const conversationId = params.id;

  const [conversationRes, messagesRes, requestsRes] = await Promise.all([
    api.api.conversations({ id: conversationId }).get(),
    api.api.conversations({ id: conversationId }).messages.get(),
    api.api.conversations({ id: conversationId }).requests.get(),
  ]);

  if (conversationRes.error || !conversationRes.data || "error" in conversationRes.data) {
    throw error(404, "Conversation not found");
  }
  if (messagesRes.error || !messagesRes.data) {
    throw error(500, "Failed to load messages");
  }
  if (requestsRes.error || !requestsRes.data) {
    throw error(500, "Failed to load requests");
  }

  return {
    conversation: conversationRes.data,
    messages: messagesRes.data.messages,
    requests: requestsRes.data.requests,
  };
};
