import { sql } from "drizzle-orm";
import type { UsageConversation, UsageDay, UsageModel, UsageResponse } from "$lib/contracts";
import { db } from "$lib/server/db/client";

const WINDOW_DAYS = 30;

export async function buildUsageResponse(): Promise<UsageResponse> {
  const since = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const days = await db.all<UsageDay>(sql`
    select date(created_at / 1000, 'unixepoch') as day,
           coalesce(sum(cost), 0) as cost,
           coalesce(sum(json_extract(tokens, '$.total')), 0) as tokens,
           count(*) as messages
    from message
    where role = 'assistant' and created_at >= ${since}
    group by day
    order by day
  `);

  const models = await db.all<UsageModel>(sql`
    select c.agent_id as agentId,
           coalesce(m.model_value, 'unknown') as modelValue,
           coalesce(sum(m.cost), 0) as cost,
           coalesce(sum(json_extract(m.tokens, '$.input')), 0) as input,
           coalesce(sum(json_extract(m.tokens, '$.output')), 0) as output,
           coalesce(sum(json_extract(m.tokens, '$.thought')), 0) as reasoning,
           count(*) as messages
    from message m
    join conversation c on c.id = m.conversation_id
    where m.role = 'assistant'
    group by c.agent_id, m.model_value
    order by cost desc, output desc
  `);

  const conversationRows = await db.all<UsageConversation>(sql`
    select c.id as id,
           c.title as title,
           coalesce(sum(m.cost), 0) as cost,
           coalesce(sum(json_extract(m.tokens, '$.total')), 0) as tokens,
           count(*) as messages
    from message m
    join conversation c on c.id = m.conversation_id
    where m.role = 'assistant'
    group by c.id
    order by cost desc, tokens desc
    limit 8
  `);

  const totals = days.reduce(
    (acc, day) => ({
      cost: acc.cost + day.cost,
      tokens: acc.tokens + day.tokens,
      messages: acc.messages + day.messages,
    }),
    { cost: 0, tokens: 0, messages: 0 },
  );

  return { days, models, topConversations: conversationRows, totals, windowDays: WINDOW_DAYS };
}
