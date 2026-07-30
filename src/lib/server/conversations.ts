import { cp, rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/opencode";
import { HttpError } from "$lib/server/http-error";
import { generateId } from "$lib/server/ids";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import {
  getConversationRoot,
  provisionConversationDirectories,
  type ConversationLocator,
} from "$lib/server/paths";

export interface CreatedConversation {
  id: string;
  session: { id: string; title: string };
}

export async function createConversation(
  title: string,
  projectId: string | null = null,
): Promise<CreatedConversation> {
  const locator: ConversationLocator = { id: generateId(), project_id: projectId };
  const root = getConversationRoot(locator);
  let openCodeSessionId: string | null = null;

  try {
    await provisionConversationDirectories(locator);

    const { client } = await opencodeServer.conversationClient(locator);
    // No explicit session title: OpenCode only auto-generates titles for
    // sessions still carrying its own default. Kepler's row holds the
    // display title until the generated one syncs in.
    const { data: session, error } = await client.session.create({});
    if (error || !session) throw new Error("Failed to create OpenCode session");
    openCodeSessionId = session.id;

    await db.insert(conversation).values({
      id: locator.id,
      opencode_session_id: session.id,
      project_id: projectId,
      title,
    });

    return { id: locator.id, session: { id: session.id, title } };
  } catch (err) {
    if (openCodeSessionId) {
      const { client } = await opencodeServer.conversationClient(locator);
      await client.session.delete({ sessionID: openCodeSessionId }).catch(() => {});
    }
    await rm(root, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Fork a conversation at a message: copy its working directory (so file state
 * matches the transcript) and fork the OpenCode session into the new directory.
 */
export async function branchConversation(
  id: string,
  messageID?: string,
): Promise<CreatedConversation> {
  const source = await requireConversation(id);
  const locator: ConversationLocator = {
    id: generateId(),
    project_id: source.project_id,
  };
  const root = getConversationRoot(locator);

  try {
    await cp(getConversationRoot(source), root, { recursive: true });

    const { client } = await opencodeServer.conversationClient(locator);
    const { data: session, error } = await client.session.fork({
      sessionID: source.opencode_session_id,
      messageID,
    });
    if (error || !session) throw new Error("Failed to fork OpenCode session");

    const title = `${source.title} (branch)`;
    await db.insert(conversation).values({
      id: locator.id,
      opencode_session_id: session.id,
      project_id: source.project_id,
      title,
      provider_id: source.provider_id,
      model_id: source.model_id,
    });

    return { id: locator.id, session: { id: session.id, title } };
  } catch (err) {
    await rm(root, { recursive: true, force: true });
    throw err;
  }
}

export async function deleteConversationMessage(
  id: string,
  messageID: string,
): Promise<void> {
  const conv = await requireConversation(id);
  const { client } = await opencodeServer.conversationClient(conv);
  const { error } = await client.session.deleteMessage({
    sessionID: conv.opencode_session_id,
    messageID,
  });
  if (error) throw new Error("Failed to delete message");
}

/** Revert the session to just before `messageID`; the next prompt discards the tail. */
export async function revertConversation(id: string, messageID: string): Promise<void> {
  const conv = await requireConversation(id);
  const { client } = await opencodeServer.conversationClient(conv);
  const { error } = await client.session.revert({
    sessionID: conv.opencode_session_id,
    messageID,
  });
  if (error) throw new Error("Failed to revert conversation");
}

export async function renameConversation(id: string, title: string) {
  const conv = await requireConversation(id);
  const { client } = await opencodeServer.conversationClient(conv);
  const { error } = await client.session.update({
    sessionID: conv.opencode_session_id,
    title,
  });
  if (error) throw new Error("Failed to rename OpenCode session");
  const [row] = await db
    .update(conversation)
    .set({ title })
    .where(eq(conversation.id, id))
    .returning();
  return row;
}

export async function requireConversation(id: string) {
  const conv = await db.query.conversation.findFirst({
    where: (fields, { eq: eqOp }) => eqOp(fields.id, id),
  });
  if (!conv) throw new HttpError(404, "Conversation not found");
  return conv;
}

export async function deleteConversation(id: string): Promise<void> {
  const conv = await requireConversation(id);

  // Best effort: a corrupted or already-removed session must not block the
  // filesystem and DB teardown — delete stays idempotent.
  try {
    const { client } = await opencodeServer.conversationClient(conv);
    const { error } = await client.session.delete({ sessionID: conv.opencode_session_id });
    if (error) {
      console.warn(`OpenCode session ${conv.opencode_session_id} not deleted:`, error);
    }
  } catch (err) {
    console.warn(`OpenCode unreachable while deleting conversation ${id}:`, err);
  }

  await rm(getConversationRoot(conv), { recursive: true, force: true });
  await db.delete(conversation).where(eq(conversation.id, id));
}
