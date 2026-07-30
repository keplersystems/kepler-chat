import { error, fail } from "@sveltejs/kit";
import { serverApi } from "$lib/api";
import {
  rejectQuestion,
  replyPermission,
  replyQuestion,
} from "$lib/server/requests";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, params, url }) => {
  const api = serverApi(fetch, url.origin);
  const conversationId = params.id;

  const [conversationRes, messagesRes, requestsRes, modelRes] = await Promise.all([
    api.api.conversations({ id: conversationId }).get(),
    api.api.conversations({ id: conversationId }).messages.get(),
    api.api.conversations({ id: conversationId }).requests.get(),
    api.api.conversations({ id: conversationId }).model.get(),
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

  const selectedModel =
    modelRes.data && !("error" in modelRes.data) ? modelRes.data.model : null;

  return {
    conversation: conversationRes.data,
    messages: messagesRes.data,
    requests: requestsRes.data.requests,
    selectedModel,
  };
};

export const actions: Actions = {
  replyPermission: async ({ request, params }) => {
    const data = await request.formData();
    const requestId = data.get("requestId");
    const reply = data.get("reply");
    const message = data.get("message");
    if (typeof requestId !== "string" || typeof reply !== "string") {
      return fail(400, { error: "requestId and reply required" });
    }
    if (reply !== "once" && reply !== "always" && reply !== "reject") {
      return fail(400, { error: "Invalid reply" });
    }
    await replyPermission(
      params.id,
      requestId,
      reply,
      typeof message === "string" && message.length > 0 ? message : undefined,
    );
    return { success: true };
  },

  replyQuestion: async ({ request, params }) => {
    const data = await request.formData();
    const requestId = data.get("requestId");
    const questionCount = Number(data.get("questionCount"));
    if (typeof requestId !== "string" || !Number.isInteger(questionCount) || questionCount < 1) {
      return fail(400, { error: "requestId and questionCount required" });
    }
    const answers: string[][] = [];
    for (let i = 0; i < questionCount; i++) {
      const values = data
        .getAll(`answer-${i}`)
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      if (values.length === 0) {
        return fail(400, { error: `Answer required for question ${i + 1}` });
      }
      answers.push(values);
    }
    await replyQuestion(params.id, requestId, answers);
    return { success: true };
  },

  rejectQuestion: async ({ request, params }) => {
    const data = await request.formData();
    const requestId = data.get("requestId");
    if (typeof requestId !== "string") {
      return fail(400, { error: "requestId required" });
    }
    await rejectQuestion(params.id, requestId);
    return { success: true };
  },
};
