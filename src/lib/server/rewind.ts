// Edit/regenerate share one shape: rewind the engine context to just before a
// user turn, delete the discarded Kepler rows, and re-send. Honest only
// because drivers implement a real rewind (fork-truncate or revert).

import { eq, inArray } from "drizzle-orm";
import type { SendMessageInput } from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { conversation, message, part } from "$lib/server/db/schema/kepler";
import { HttpError } from "$lib/server/http-error";
import { driverFor } from "$lib/server/engine/registry";
import { hasGeneration } from "$lib/server/engine/core/stream-hub";
import type { ConversationRow } from "$lib/server/engine/types";

type MessageRow = typeof message.$inferSelect;
type PartRow = typeof part.$inferSelect;

/** Rebuild send-API attachments from a deleted user message's file parts. */
function attachmentsFromParts(conversationId: string, parts: PartRow[]): SendMessageInput["attachments"] {
  const prefix = `/api/conversations/${encodeURIComponent(conversationId)}/files/`;
  const attachments: NonNullable<SendMessageInput["attachments"]> = [];
  for (const row of parts) {
    if (row.type !== "file") continue;
    const view = JSON.parse(row.content) as { url: string; filename: string; mimeType?: string };
    const url = new URL(view.url, "http://local");
    if (!url.pathname.startsWith(prefix) || url.searchParams.get("scope") !== "input") continue;
    const path = url.pathname
      .slice(prefix.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    attachments.push({ path, mimeType: view.mimeType, filename: view.filename });
  }
  return attachments.length > 0 ? attachments : undefined;
}

/**
 * Rewind for an edit (target = user message, resend with new text) or a
 * regenerate (target = assistant message, resend the preceding user turn).
 * Returns the input for the follow-up turn; rows from the discarded user turn
 * onward are deleted and the engine context is rewound.
 */
export async function rewindForResend(
  conv: ConversationRow,
  targetMessageId: string,
  kind: "edit" | "regenerate",
  newText?: string,
): Promise<SendMessageInput> {
  if (hasGeneration(conv.id)) {
    throw new HttpError(409, "A response is already streaming for this conversation");
  }
  const driver = driverFor(conv.agent_id);
  if (kind === "edit" && !driver.capabilities.editMessage) {
    throw new HttpError(400, "This agent cannot edit messages");
  }
  if (kind === "regenerate" && !driver.capabilities.regenerate) {
    throw new HttpError(400, "This agent cannot regenerate messages");
  }

  const messages: MessageRow[] = await db.query.message.findMany({
    where: (fields, { eq: eqOp }) => eqOp(fields.conversation_id, conv.id),
    orderBy: (fields, { asc }) => [asc(fields.created_at)],
  });
  const targetIndex = messages.findIndex((row) => row.id === targetMessageId);
  if (targetIndex === -1) throw new HttpError(404, "Message not found");
  const target = messages[targetIndex];

  let userIndex: number;
  if (kind === "edit") {
    if (target.role !== "user") throw new HttpError(400, "Only user messages can be edited");
    userIndex = targetIndex;
  } else {
    if (target.role !== "assistant") {
      throw new HttpError(400, "Only assistant messages can be regenerated");
    }
    userIndex = messages.slice(0, targetIndex).findLastIndex((row) => row.role === "user");
    if (userIndex === -1) throw new HttpError(400, "No user message to re-run");
  }
  const userRow = messages[userIndex];

  // The engine anchor is the last assistant message that survives the rewind.
  const anchor = messages
    .slice(0, userIndex)
    .findLast((row) => row.role === "assistant" && row.engine_message_id);
  const survivorsHaveTurns = messages.slice(0, userIndex).some((row) => row.role === "assistant");
  if (survivorsHaveTurns && !anchor) {
    throw new HttpError(400, "Earlier messages predate rewind support");
  }

  const discarded = messages.slice(userIndex);
  const userParts = await db.query.part.findMany({
    where: (fields, { eq: eqOp }) => eqOp(fields.message_id, userRow.id),
    orderBy: (fields, { asc }) => [asc(fields.ord)],
  });
  const text =
    kind === "edit"
      ? (newText ?? "")
      : userParts
          .filter((row) => row.type === "text")
          .map((row) => (JSON.parse(row.content) as { text: string }).text)
          .join("\n\n");
  if (!text.trim()) throw new HttpError(400, "Nothing to resend");

  await driver.rewindTo(conv, anchor?.engine_message_id ?? undefined);

  const discardedIds = discarded.map((row) => row.id);
  await db.delete(part).where(inArray(part.message_id, discardedIds));
  await db.delete(message).where(inArray(message.id, discardedIds));
  // The cumulative usage snapshot no longer describes the rewound context.
  await db
    .update(conversation)
    .set({ total_tokens: null })
    .where(eq(conversation.id, conv.id));
  conv.total_tokens = null;

  return { text, attachments: attachmentsFromParts(conv.id, userParts) };
}
