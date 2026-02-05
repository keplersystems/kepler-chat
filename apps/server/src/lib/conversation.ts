import { db } from "@kepler-chat/db";

export async function requireConversationOwnership(
  conversationId: string,
  userId: string,
) {
  const conv = await db.query.conversation.findFirst({
    where: (fields, { and, eq }) =>
      and(eq(fields.id, conversationId), eq(fields.user_id, userId)),
  });

  if (!conv) {
    return null;
  }

  return conv;
}

