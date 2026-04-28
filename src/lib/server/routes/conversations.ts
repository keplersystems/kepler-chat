import { Elysia, t } from "elysia";
import { db } from "$lib/server/db/client";
import { requireAuth } from "$lib/server/auth";
import {
  createConversation,
  deleteConversation,
  requireConversation,
} from "$lib/server/conversations";

export const conversationsRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      return db.query.conversation.findMany({
        orderBy: (c, { desc }) => [desc(c.updated_at)],
      });
    },
    {
      detail: {
        summary: "List conversations",
        tags: ["Conversations"],
        description: "Get all conversations",
      },
    },
  )
  .post(
    "/",
    async (context) => {
      requireAuth(context);
      return createConversation(context.body.title);
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 255 }),
      }),
      detail: {
        summary: "Create conversation",
        tags: ["Conversations"],
        description: "Create a new conversation (OpenCode session)",
      },
    },
  )
  .get(
    "/:id",
    async (context) => {
      requireAuth(context);
      return requireConversation(context.params.id);
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Get conversation",
        tags: ["Conversations"],
        description: "Get a single conversation by ID",
      },
    },
  )
  .delete(
    "/:id",
    async (context) => {
      requireAuth(context);
      await deleteConversation(context.params.id);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete conversation",
        tags: ["Conversations"],
        description: "Delete a conversation, its OpenCode session, and files",
      },
    },
  );
