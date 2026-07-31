import { cp, rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import type { AgentId, ConversationMode } from "$lib/contracts";
import { driverFor } from "$lib/server/engine/registry";
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
  mode: ConversationMode,
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
        mode,
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
 * transcript), copy the message history up to the anchor, and fork the
 * engine's session so the branch inherits its context. `atMessageId` (a
 * Kepler message id) branches at that message; omitted branches at head.
 */
export async function branchConversation(
  id: string,
  atMessageId?: string,
): Promise<ConversationRow> {
  const source = await requireConversation(id);
  const driver = driverFor(source.agent_id);
  const locator: ConversationLocator = { id: generateId(), project_id: source.project_id };
  const root = getConversationRoot(locator);

  const messages = await db.query.message.findMany({
    where: (fields, { eq: eqOp }) => eqOp(fields.conversation_id, id),
    orderBy: (fields, { asc }) => [asc(fields.created_at)],
  });
  let kept = messages;
  let anchorEngineId: string | undefined;
  if (atMessageId) {
    const anchorIndex = messages.findIndex((row) => row.id === atMessageId);
    if (anchorIndex === -1) throw new HttpError(404, "Message not found");
    const anchor = messages[anchorIndex];
    if (!anchor.engine_message_id) {
      throw new HttpError(400, "This message cannot anchor a branch");
    }
    if (!driver.capabilities.forkAtMessage) {
      throw new HttpError(400, "This agent cannot branch at a message");
    }
    kept = messages.slice(0, anchorIndex + 1);
    anchorEngineId = anchor.engine_message_id;
  } else if (!driver.capabilities.fork) {
    throw new HttpError(400, "This agent cannot branch a conversation");
  }

  try {
    await cp(getConversationRoot(source), root, { recursive: true });

    const fork = await driver.forkSession(source, { ...source, id: locator.id }, anchorEngineId);

    const [row] = await db
      .insert(conversation)
      .values({
        id: locator.id,
        agent_id: source.agent_id,
        mode: source.mode,
        engine_session_id: fork.engineSessionId,
        fork_pending: fork.forkPending,
        project_id: source.project_id,
        title: `${source.title} (branch)`,
        model_value: source.model_value,
        config_options: source.config_options,
        context_used: source.context_used,
        context_size: source.context_size,
        total_cost: source.total_cost,
        total_tokens: source.total_tokens,
      })
      .returning();

    const keptIds = new Set(kept.map((row) => row.id));
    const parts = (
      await db.query.part.findMany({
        where: (fields, { eq: eqOp }) => eqOp(fields.conversation_id, id),
      })
    ).filter((row) => keptIds.has(row.message_id));
    const messageIdMap = new Map(kept.map((row) => [row.id, generateId()]));
    if (kept.length > 0) {
      await db.insert(message).values(
        kept.map((row) => ({
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
  await driverFor(conv.agent_id)
    .deleteSession(conv)
    .catch((err) => {
      console.warn(`Engine session cleanup failed for conversation ${id}:`, err);
    });
  await rm(getConversationRoot(conv), { recursive: true, force: true });
  await db.delete(part).where(eq(part.conversation_id, id));
  await db.delete(message).where(eq(message.conversation_id, id));
  await db.delete(conversation).where(eq(conversation.id, id));
}
