import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
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
