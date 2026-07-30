import { Elysia, t } from "elysia";
import type { MessageSearchResult } from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { requireAuth } from "$lib/server/auth";
import { searchMessageText } from "$lib/server/opencode-db";

function snippet(text: string, query: string, radius = 70): string {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

export const searchRoute = new Elysia({ prefix: "/api/search" }).get(
  "/",
  async (context) => {
    requireAuth(context);
    const query = context.query.q.trim();
    if (query.length < 2) return { results: [] };

    const [matches, conversations] = await Promise.all([
      searchMessageText(query),
      db.query.conversation.findMany(),
    ]);
    const bySession = new Map(conversations.map((c) => [c.opencode_session_id, c]));

    const seen = new Set<string>();
    const results: MessageSearchResult[] = [];
    for (const match of matches) {
      const conversation = bySession.get(match.sessionID);
      if (!conversation) continue;
      const key = `${conversation.id}:${match.messageID}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        conversationId: conversation.id,
        title: conversation.title,
        role: match.role,
        snippet: snippet(match.text, query),
        time: match.time,
      });
      if (results.length >= 20) break;
    }
    return { results };
  },
  {
    query: t.Object({ q: t.String() }),
    detail: {
      summary: "Search messages",
      tags: ["Search"],
      description: "Full-text search across conversation message text",
    },
  },
);
