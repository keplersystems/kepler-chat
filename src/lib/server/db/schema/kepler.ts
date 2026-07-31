import { relations, sql } from "drizzle-orm";
import { AGENT_IDS, STOP_REASONS } from "$lib/contracts";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull();

export const project = sqliteTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  filename: text("filename").notNull(),
  mime_type: text("mime_type"),
  size: integer("size").notNull(),
  created_at: createdAt(),
});

export const conversation = sqliteTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    agent_id: text("agent_id", { enum: AGENT_IDS }).notNull(),
    acp_session_id: text("acp_session_id"),
    project_id: text("project_id").references(() => project.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    model_value: text("model_value"),
    mode_id: text("mode_id"),
    /** JSON map of chosen session config option ids to values, reapplied per session. */
    config_options: text("config_options"),
    context_used: integer("context_used"),
    context_size: integer("context_size"),
    total_cost: real("total_cost").notNull().default(0),
    /** JSON TurnTokens: last cumulative usage snapshot, for per-turn deltas. */
    total_tokens: text("total_tokens"),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (table) => [index("conversation_project_idx").on(table.project_id)],
);

export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversation_id: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    stop_reason: text("stop_reason", { enum: STOP_REASONS }),
    error: text("error"),
    model_value: text("model_value"),
    /** Turn cost delta in USD, derived from cumulative usage_update values. */
    cost: real("cost"),
    /** JSON TurnTokens from PromptResponse.usage when the agent provides it. */
    tokens: text("tokens"),
    created_at: createdAt(),
    completed_at: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("message_conversation_idx").on(table.conversation_id, table.created_at),
  ],
);

export const part = sqliteTable(
  "part",
  {
    id: text("id").primaryKey(),
    message_id: text("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    conversation_id: text("conversation_id").notNull(),
    ord: integer("ord").notNull(),
    type: text("type", { enum: ["text", "reasoning", "tool", "file"] }).notNull(),
    /** JSON PartView payload (minus id/type). */
    content: text("content").notNull(),
    /** Searchable plain-text extract, mirrored into part_fts by triggers. */
    text: text("text").notNull().default(""),
  },
  (table) => [index("part_message_idx").on(table.message_id, table.ord)],
);

export const mcpServer = sqliteTable(
  "mcp_server",
  {
    name: text("name").notNull(),
    /** Global scope uses the empty string; SQLite PKs reject NULL. */
    project_id: text("project_id").notNull().default(""),
    /** JSON McpServerConfig. */
    config: text("config").notNull(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.name, table.project_id] })],
);

export const agentEnvProfile = sqliteTable(
  "agent_env_profile",
  {
    agent_id: text("agent_id", { enum: AGENT_IDS }).notNull(),
    env_key: text("env_key").notNull(),
    encrypted_value: text("encrypted_value").notNull(),
    iv: text("iv").notNull(),
    auth_tag: text("auth_tag").notNull(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.agent_id, table.env_key] })],
);

export const projectRelations = relations(project, ({ many }) => ({
  conversations: many(conversation),
}));

export const conversationRelations = relations(conversation, ({ one, many }) => ({
  project: one(project, {
    fields: [conversation.project_id],
    references: [project.id],
  }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
  conversation: one(conversation, {
    fields: [message.conversation_id],
    references: [conversation.id],
  }),
  parts: many(part),
}));

export const partRelations = relations(part, ({ one }) => ({
  message: one(message, {
    fields: [part.message_id],
    references: [message.id],
  }),
}));
