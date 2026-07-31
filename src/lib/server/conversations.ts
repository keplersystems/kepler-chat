import { cp, rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { AgentId } from "$lib/contracts";
import { deleteSessionFor, forkSession } from "$lib/server/acp/engine";
import { db } from "$lib/server/db/client";
import { conversation, message, part } from "$lib/server/db/schema/kepler";
import { HttpError } from "$lib/server/http-error";
import { generateId } from "$lib/server/ids";
import {
  getConversationRoot,
  provisionConversationDirectories,
  type ConversationLocator,
} from "$lib/server/paths";
import { materializeConversationRuntime } from "$lib/server/runtime";

export type ConversationRow = typeof conversation.$inferSelect;

export async function createConversation(
  agentId: AgentId,
  title: string,
  projectId: string | null = null,
  configOptions: Record<string, string> = {},
): Promise<ConversationRow> {
  const locator: ConversationLocator = { id: generateId(), project_id: projectId };
  const root = getConversationRoot(locator);
  try {
    await provisionConversationDirectories(locator);
    await materializeConversationRuntime(locator);
    const [row] = await db
      .insert(conversation)
      .values({
        id: locator.id,
        agent_id: agentId,
        project_id: projectId,
        title,
        model_value: configOptions.model ?? null,
        config_options: Object.keys(configOptions).length > 0 ? JSON.stringify(configOptions) : null,
      })
      .returning();
    return row;
  } catch (err) {
    await rm(root, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Branch a conversation: copy its working directory (so file state matches the
 * transcript), copy the message history, and fork the agent's session so the
 * branch inherits its context. Agents without fork cannot express this, so the
 * caller must not offer it for them — a memoryless copy would be a lie.
 */
export async function branchConversation(id: string): Promise<ConversationRow> {
  const source = await requireConversation(id);
  const locator: ConversationLocator = { id: generateId(), project_id: source.project_id };
  const root = getConversationRoot(locator);

  try {
    await cp(getConversationRoot(source), root, { recursive: true });

    const forkedSessionId = await forkSession(source, { ...source, id: locator.id });
    if (!forkedSessionId) {
      throw new HttpError(400, "This agent cannot branch a conversation");
    }

    const [row] = await db
      .insert(conversation)
      .values({
        id: locator.id,
        agent_id: source.agent_id,
        acp_session_id: forkedSessionId,
        project_id: source.project_id,
        title: `${source.title} (branch)`,
        model_value: source.model_value,
        mode_id: source.mode_id,
        context_used: source.context_used,
        context_size: source.context_size,
        total_cost: source.total_cost,
        total_tokens: source.total_tokens,
      })
      .returning();

    const messages = await db.query.message.findMany({
      where: (fields, { eq: eqOp }) => eqOp(fields.conversation_id, id),
    });
    const parts = await db.query.part.findMany({
      where: (fields, { eq: eqOp }) => eqOp(fields.conversation_id, id),
    });
    const messageIdMap = new Map(messages.map((row) => [row.id, generateId()]));
    if (messages.length > 0) {
      await db.insert(message).values(
        messages.map((row) => ({
          ...row,
          id: messageIdMap.get(row.id)!,
          conversation_id: locator.id,
        })),
      );
    }
    if (parts.length > 0) {
      await db.insert(part).values(
        parts.map((row) => ({
          ...row,
          id: generateId(),
          message_id: messageIdMap.get(row.message_id)!,
          conversation_id: locator.id,
        })),
      );
    }

    return row;
  } catch (err) {
    await rm(root, { recursive: true, force: true });
    throw err;
  }
}

export async function renameConversation(id: string, title: string): Promise<ConversationRow> {
  await requireConversation(id);
  const [row] = await db
    .update(conversation)
    .set({ title })
    .where(eq(conversation.id, id))
    .returning();
  return row;
}

export async function requireConversation(id: string): Promise<ConversationRow> {
  const conv = await db.query.conversation.findFirst({
    where: (fields, { eq: eqOp }) => eqOp(fields.id, id),
  });
  if (!conv) throw new HttpError(404, "Conversation not found");
  return conv;
}

export async function deleteConversation(id: string): Promise<void> {
  const conv = await requireConversation(id);
  // Best effort: an unreachable agent must not block filesystem and DB
  // teardown — delete stays idempotent.
  await deleteSessionFor(conv).catch((err) => {
    console.warn(`ACP session cleanup failed for conversation ${id}:`, err);
  });
  await rm(getConversationRoot(conv), { recursive: true, force: true });
  await db.delete(part).where(eq(part.conversation_id, id));
  await db.delete(message).where(eq(message.conversation_id, id));
  await db.delete(conversation).where(eq(conversation.id, id));
}
