import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/opencode";
import { HttpError } from "$lib/server/http-error";
import { generateId } from "$lib/server/ids";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import {
  getConversationRoot,
  provisionConversationDirectories,
} from "$lib/server/paths";

export interface CreatedConversation {
  id: string;
  session: { id: string; title: string };
}

export async function createConversation(title: string): Promise<CreatedConversation> {
  const id = generateId();
  const root = getConversationRoot(id);
  let openCodeSessionId: string | null = null;

  try {
    await provisionConversationDirectories(id);

    const { client } = await opencodeServer.conversationClient(id);
    const { data: session, error } = await client.session.create({ title });
    if (error || !session) throw new Error("Failed to create OpenCode session");
    openCodeSessionId = session.id;

    await db.insert(conversation).values({
      id,
      opencode_session_id: session.id,
      title: session.title,
    });

    return { id, session: { id: session.id, title: session.title } };
  } catch (err) {
    if (openCodeSessionId) {
      const { client } = await opencodeServer.conversationClient(id);
      await client.session.delete({ sessionID: openCodeSessionId }).catch(() => {});
    }
    await rm(root, { recursive: true, force: true });
    throw err;
  }
}

export async function deleteConversation(id: string): Promise<void> {
  const conv = await db.query.conversation.findFirst({
    where: (fields, { eq: eqOp }) => eqOp(fields.id, id),
  });
  if (!conv) throw new HttpError(404, "Conversation not found");

  const { client } = await opencodeServer.conversationClient(id);
  const { error } = await client.session.delete({ sessionID: conv.opencode_session_id });
  if (error) throw new Error("Failed to delete OpenCode session");

  await rm(getConversationRoot(id), { recursive: true, force: true });
  await db.delete(conversation).where(eq(conversation.id, id));
}
