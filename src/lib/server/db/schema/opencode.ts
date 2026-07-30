import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const project = sqliteTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updated_at: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  hash: text("hash").notNull().unique(),
  filename: text("filename").notNull(),
  mime_type: text("mime_type"),
  size: integer("size").notNull(),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const conversation = sqliteTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    opencode_session_id: text("opencode_session_id").notNull(),
    project_id: text("project_id").references(() => project.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    provider_id: text("provider_id"),
    model_id: text("model_id"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("conversation_project_idx").on(table.project_id)],
);

export const providerEnvProfile = sqliteTable(
  "provider_env_profile",
  {
    provider_id: text("provider_id").notNull(),
    env_key: text("env_key").notNull(),
    encrypted_value: text("encrypted_value").notNull(),
    iv: text("iv").notNull(),
    auth_tag: text("auth_tag").notNull(),
    key_version: integer("key_version").notNull().default(1),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider_id, table.env_key] }),
    index("provider_env_profile_provider_idx").on(table.provider_id),
  ],
);

export const projectRelations = relations(project, ({ many }) => ({
  conversations: many(conversation),
}));

export const conversationRelations = relations(conversation, ({ one }) => ({
  project: one(project, {
    fields: [conversation.project_id],
    references: [project.id],
  }),
}));
