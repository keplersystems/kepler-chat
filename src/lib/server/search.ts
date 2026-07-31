import { sql } from "drizzle-orm";
import { db } from "$lib/server/db/client";

export interface SearchRow {
  conversationId: string;
  title: string;
  role: string;
  text: string;
  time: number;
}

export async function searchMessageText(query: string, limit = 60): Promise<SearchRow[]> {
  const ftsQuery = `"${query.replaceAll('"', '""')}"`;
  return db.all<SearchRow>(sql`
    select c.id as conversationId,
           c.title as title,
           m.role as role,
           p.text as text,
           m.created_at as time
    from part_fts f
    join part p on p.rowid = f.rowid
    join message m on m.id = p.message_id
    join conversation c on c.id = m.conversation_id
    where part_fts match ${ftsQuery}
    order by m.created_at desc
    limit ${limit}
  `);
}
