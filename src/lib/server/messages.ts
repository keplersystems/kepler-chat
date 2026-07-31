import { asc } from "drizzle-orm";
import type { MessageView, PartView, TurnTokens } from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { message, part } from "$lib/server/db/schema/kepler";

type MessageRow = typeof message.$inferSelect;
type PartRow = typeof part.$inferSelect;

function toView(row: MessageRow, parts: PartRow[]): MessageView {
  return {
    id: row.id,
    role: row.role,
    parts: parts.map((partRow) => JSON.parse(partRow.content) as PartView),
    stopReason: row.stop_reason ?? undefined,
    error: row.error ?? undefined,
    modelValue: row.model_value ?? undefined,
    cost: row.cost ?? undefined,
    tokens: row.tokens ? (JSON.parse(row.tokens) as TurnTokens) : undefined,
    createdAt: row.created_at.getTime(),
    completedAt: row.completed_at?.getTime(),
  };
}

export async function listMessages(conversationId: string): Promise<MessageView[]> {
  const [messages, parts] = await Promise.all([
    db.query.message.findMany({
      where: (fields, { eq: eqOp }) => eqOp(fields.conversation_id, conversationId),
      orderBy: [asc(message.created_at)],
    }),
    db.query.part.findMany({
      where: (fields, { eq: eqOp }) => eqOp(fields.conversation_id, conversationId),
      orderBy: [asc(part.ord)],
    }),
  ]);
  const partsByMessage = new Map<string, PartRow[]>();
  for (const partRow of parts) {
    const list = partsByMessage.get(partRow.message_id) ?? [];
    list.push(partRow);
    partsByMessage.set(partRow.message_id, list);
  }
  return messages.map((row) => toView(row, partsByMessage.get(row.id) ?? []));
}
