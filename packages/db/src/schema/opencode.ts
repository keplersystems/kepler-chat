import { relations, sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const opencodeInstance = sqliteTable(
  "opencode_instance",
  {
    user_id: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    server_url: text("server_url").notNull(),
    port: integer("port").notNull(),
    pid: integer("pid"),
    spawned_at: integer("spawned_at", { mode: "timestamp_ms" }).notNull(),
    last_active_at: integer("last_active_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status").notNull(),
    error: text("error"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
);

export const conversation = sqliteTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
  },
  (table) => [index("conversation_user_idx").on(table.user_id)],
);

export const providerCredential = sqliteTable(
  "provider_credential",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider_id: text("provider_id").notNull(),
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
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.provider_id] }),
    index("provider_credential_user_idx").on(table.user_id),
  ],
);

export const conversationMessageModel = sqliteTable(
  "conversation_message_model",
  {
    conversation_id: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    index("conversation_message_model_user_idx").on(table.user_id),
  ],
);

export const providerEnvProfile = sqliteTable(
  "provider_env_profile",
  {
    user_id: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    primaryKey({ columns: [table.user_id, table.provider_id, table.env_key] }),
    index("provider_env_profile_user_idx").on(table.user_id),
    index("provider_env_profile_provider_idx").on(table.provider_id),
  ],
);

export const opencodeInstanceRelations = relations(opencodeInstance, ({ one, many }) => ({
  user: one(user, {
    fields: [opencodeInstance.user_id],
    references: [user.id],
  }),
  conversations: many(conversation),
}));

export const conversationRelations = relations(conversation, ({ one }) => ({
  user: one(user, {
    fields: [conversation.user_id],
    references: [user.id],
  }),
  instance: one(opencodeInstance, {
    fields: [conversation.user_id],
    references: [opencodeInstance.user_id],
  }),
}));

export const providerCredentialRelations = relations(
  providerCredential,
  ({ one }) => ({
    user: one(user, {
      fields: [providerCredential.user_id],
      references: [user.id],
    }),
  }),
);

export const conversationMessageModelRelations = relations(
  conversationMessageModel,
  ({ one }) => ({
    user: one(user, {
      fields: [conversationMessageModel.user_id],
      references: [user.id],
    }),
    conversation: one(conversation, {
      fields: [conversationMessageModel.conversation_id],
      references: [conversation.id],
    }),
  }),
);

export const providerEnvProfileRelations = relations(
  providerEnvProfile,
  ({ one }) => ({
    user: one(user, {
      fields: [providerEnvProfile.user_id],
      references: [user.id],
    }),
  }),
);
