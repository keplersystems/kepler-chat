import { Elysia } from "elysia";
import type { UsageResponse } from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { requireAuth } from "$lib/server/auth";
import { usageByDay, usageByModel, usageBySession } from "$lib/server/opencode-db";

const DAYS = 30;

export const usageRoute = new Elysia({ prefix: "/api/usage" }).get(
  "/",
  async (context): Promise<UsageResponse> => {
    requireAuth(context);
    const since = Date.now() - DAYS * 86_400_000;
    const [days, models, sessions, conversations] = await Promise.all([
      usageByDay(since),
      usageByModel(),
      usageBySession(),
      db.query.conversation.findMany(),
    ]);

    const titleBySession = new Map(
      conversations.map((c) => [c.opencode_session_id, { id: c.id, title: c.title }]),
    );
    const topConversations = sessions
      .map((s) => {
        const conv = titleBySession.get(s.sessionID);
        return conv ? { ...conv, cost: s.cost, tokens: s.tokens, messages: s.messages } : null;
      })
      .filter((c) => c !== null)
      .slice(0, 8);

    const totals = {
      cost: days.reduce((n, d) => n + d.cost, 0),
      tokens: days.reduce((n, d) => n + d.tokens, 0),
      messages: days.reduce((n, d) => n + d.messages, 0),
    };

    return { days, models, topConversations, totals, windowDays: DAYS };
  },
  {
    detail: {
      summary: "Usage aggregates",
      tags: ["Usage"],
      description: "Token and cost aggregates from OpenCode's message store",
    },
  },
);
