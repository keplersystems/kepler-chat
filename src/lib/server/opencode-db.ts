import { resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { getSessionsRoot } from "$lib/server/paths";

/**
 * Read-only view into OpenCode's own SQLite (sessions, messages, parts).
 * OpenCode owns writes; Kepler only aggregates and searches.
 */
let client: Client | null = null;

function opencodeDb(): Client {
  if (!client) {
    const path = resolve(getSessionsRoot(), ".opencode/data/opencode/opencode.db");
    client = createClient({ url: `file:${path}` });
  }
  return client;
}

export interface UsageDay {
  day: string;
  cost: number;
  tokens: number;
  messages: number;
}

export interface UsageModel {
  providerID: string;
  modelID: string;
  cost: number;
  input: number;
  output: number;
  reasoning: number;
  messages: number;
}

export interface UsageSession {
  sessionID: string;
  cost: number;
  tokens: number;
  messages: number;
}

const ASSISTANT = "json_extract(data, '$.role') = 'assistant'";

export async function usageByDay(sinceMs: number): Promise<UsageDay[]> {
  const result = await opencodeDb().execute({
    sql: `select date(time_created / 1000, 'unixepoch') as day,
                 coalesce(sum(json_extract(data, '$.cost')), 0) as cost,
                 coalesce(sum(json_extract(data, '$.tokens.total')), 0) as tokens,
                 count(*) as messages
          from message
          where ${ASSISTANT} and time_created >= ?
          group by day
          order by day`,
    args: [sinceMs],
  });
  return result.rows.map((r) => ({
    day: new Date(String(r.day)).toISOString().slice(0, 10),
    cost: Number(r.cost),
    tokens: Number(r.tokens),
    messages: Number(r.messages),
  }));
}

export async function usageByModel(): Promise<UsageModel[]> {
  const result = await opencodeDb().execute(
    `select json_extract(data, '$.providerID') as providerID,
            json_extract(data, '$.modelID') as modelID,
            coalesce(sum(json_extract(data, '$.cost')), 0) as cost,
            coalesce(sum(json_extract(data, '$.tokens.input')), 0) as input,
            coalesce(sum(json_extract(data, '$.tokens.output')), 0) as output,
            coalesce(sum(json_extract(data, '$.tokens.reasoning')), 0) as reasoning,
            count(*) as messages
     from message
     where ${ASSISTANT} and json_extract(data, '$.modelID') is not null
     group by providerID, modelID
     order by cost desc, output desc`,
  );
  return result.rows.map((r) => ({
    providerID: String(r.providerID),
    modelID: String(r.modelID),
    cost: Number(r.cost),
    input: Number(r.input),
    output: Number(r.output),
    reasoning: Number(r.reasoning),
    messages: Number(r.messages),
  }));
}

export async function usageBySession(): Promise<UsageSession[]> {
  const result = await opencodeDb().execute(
    `select session_id as sessionID,
            coalesce(sum(json_extract(data, '$.cost')), 0) as cost,
            coalesce(sum(json_extract(data, '$.tokens.total')), 0) as tokens,
            count(*) as messages
     from message
     where ${ASSISTANT}
     group by session_id
     order by cost desc, tokens desc`,
  );
  return result.rows.map((r) => ({
    sessionID: String(r.sessionID),
    cost: Number(r.cost),
    tokens: Number(r.tokens),
    messages: Number(r.messages),
  }));
}

export interface MessageMatch {
  sessionID: string;
  messageID: string;
  role: string;
  text: string;
  time: number;
}

export async function searchMessageText(query: string, limit = 60): Promise<MessageMatch[]> {
  const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
  const result = await opencodeDb().execute({
    sql: `select p.session_id as sessionID,
                 p.message_id as messageID,
                 json_extract(m.data, '$.role') as role,
                 json_extract(p.data, '$.text') as text,
                 m.time_created as time
          from part p
          join message m on m.id = p.message_id
          where json_extract(p.data, '$.type') = 'text'
            and json_extract(p.data, '$.text') like ? escape '\\'
          order by m.time_created desc
          limit ?`,
    args: [`%${escaped}%`, limit],
  });
  return result.rows.map((r) => ({
    sessionID: String(r.sessionID),
    messageID: String(r.messageID),
    role: String(r.role),
    text: String(r.text),
    time: Number(r.time),
  }));
}
