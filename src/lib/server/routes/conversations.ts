import { Elysia, t } from "elysia";
import { db } from "$lib/server/db/client";
import { requireAuth } from "$lib/server/auth";
import {
  branchConversation,
  createConversation,
  compactConversation,
  deleteConversation,
  renameConversation,
  revertConversation,
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
      return createConversation(context.body.title, context.body.projectId ?? null);
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 255 }),
        projectId: t.Optional(t.String({ minLength: 1 })),
      }),
      detail: {
        summary: "Create conversation",
        tags: ["Conversations"],
        description: "Create a new conversation (OpenCode session), optionally inside a project",
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
  .post(
    "/:id/branch",
    async (context) => {
      requireAuth(context);
      return branchConversation(context.params.id, context.body.messageID);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ messageID: t.Optional(t.String({ minLength: 1 })) }),
      detail: {
        summary: "Branch conversation",
        tags: ["Conversations"],
        description:
          "Fork a conversation (and its working directory) at a message into a new conversation",
      },
    },
  )
  .patch(
    "/:id",
    async (context) => {
      requireAuth(context);
      return renameConversation(context.params.id, context.body.title);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ title: t.String({ minLength: 1, maxLength: 255 }) }),
      detail: {
        summary: "Rename conversation",
        tags: ["Conversations"],
        description: "Rename a conversation and its OpenCode session",
      },
    },
  )
  .post(
    "/:id/compact",
    async (context) => {
      requireAuth(context);
      await compactConversation(context.params.id);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Compact conversation",
        tags: ["Conversations"],
        description: "AI-summarize the session history to free context window",
      },
    },
  )
  .post(
    "/:id/revert",
    async (context) => {
      requireAuth(context);
      await revertConversation(context.params.id, context.body.messageID);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ messageID: t.String({ minLength: 1 }) }),
      detail: {
        summary: "Revert conversation",
        tags: ["Conversations"],
        description:
          "Revert the OpenCode session to just before a message; sending afterwards discards the reverted tail",
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
  )
  .delete(
    "/",
    async (context) => {
      requireAuth(context);
      for (const id of context.body.ids) {
        await deleteConversation(id);
      }
      return { success: true, deleted: context.body.ids.length };
    },
    {
      body: t.Object({ ids: t.Array(t.String({ minLength: 1 }), { minItems: 1, maxItems: 100 }) }),
      detail: {
        summary: "Delete conversations",
        tags: ["Conversations"],
        description: "Delete multiple conversations, their OpenCode sessions, and files",
      },
    },
  );
