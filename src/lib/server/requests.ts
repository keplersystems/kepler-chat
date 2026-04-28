import { db } from "$lib/server/db/client";
import { HttpError } from "$lib/server/http-error";
import { opencodeServer } from "$lib/server/opencode/supervisor";

async function loadConversation(conversationId: string) {
  const conv = await db.query.conversation.findFirst({
    where: (fields, { eq }) => eq(fields.id, conversationId),
  });
  if (!conv) throw new HttpError(404, "Conversation not found");
  return conv;
}

export async function replyPermission(
  conversationId: string,
  requestId: string,
  reply: "once" | "always" | "reject",
  message?: string,
): Promise<void> {
  const conv = await loadConversation(conversationId);
  const { client } = await opencodeServer.conversationClient(conversationId);

  const { data: permissions, error: listError } = await client.permission.list();
  if (listError || !permissions) throw new Error("Failed to fetch permissions");

  const match = permissions.find(
    (r) => r.id === requestId && r.sessionID === conv.opencode_session_id,
  );
  if (!match) throw new HttpError(404, "Permission request not found");

  const { error } = await client.permission.reply({ requestID: requestId, reply, message });
  if (error) throw new Error("Failed to reply to permission");
}

export async function replyQuestion(
  conversationId: string,
  requestId: string,
  answers: string[][],
): Promise<void> {
  const conv = await loadConversation(conversationId);
  const { client } = await opencodeServer.conversationClient(conversationId);

  const { data: questions, error: listError } = await client.question.list();
  if (listError || !questions) throw new Error("Failed to fetch questions");

  const match = questions.find(
    (r) => r.id === requestId && r.sessionID === conv.opencode_session_id,
  );
  if (!match) throw new HttpError(404, "Question request not found");

  const { error } = await client.question.reply({ requestID: requestId, answers });
  if (error) throw new Error("Failed to reply to question");
}

export async function rejectQuestion(
  conversationId: string,
  requestId: string,
): Promise<void> {
  const conv = await loadConversation(conversationId);
  const { client } = await opencodeServer.conversationClient(conversationId);

  const { data: questions, error: listError } = await client.question.list();
  if (listError || !questions) throw new Error("Failed to fetch questions");

  const match = questions.find(
    (r) => r.id === requestId && r.sessionID === conv.opencode_session_id,
  );
  if (!match) throw new HttpError(404, "Question request not found");

  const { error } = await client.question.reject({ requestID: requestId });
  if (error) throw new Error("Failed to reject question");
}
