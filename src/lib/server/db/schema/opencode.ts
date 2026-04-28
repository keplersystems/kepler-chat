import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const conversation = sqliteTable("conversation", {
  id: text("id").primaryKey(),
  opencode_session_id: text("opencode_session_id").notNull(),
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
});

export const providerCredential = sqliteTable("provider_credential", {
  provider_id: text("provider_id").primaryKey(),
  auth_type: text("auth_type").notNull(),
  encrypted_payload: text("encrypted_payload").notNull(),
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
});

export const conversationMessageModel = sqliteTable(
  "conversation_message_model",
  {
    conversation_id: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    opencode_message_id: text("opencode_message_id").notNull(),
    provider_id: text("provider_id").notNull(),
    model_id: text("model_id").notNull(),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("conversation_message_model_msg_uidx").on(
      table.conversation_id,
      table.opencode_message_id,
    ),
    index("conversation_message_model_conversation_idx").on(table.conversation_id),
  ],
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

export const conversationRelations = relations(conversation, ({ many }) => ({
  messageModels: many(conversationMessageModel),
}));

export const conversationMessageModelRelations = relations(
  conversationMessageModel,
  ({ one }) => ({
    conversation: one(conversation, {
      fields: [conversationMessageModel.conversation_id],
      references: [conversation.id],
    }),
  }),
);
