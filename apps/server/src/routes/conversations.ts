import { Elysia, t } from "elysia";
import { db } from "@kepler-chat/db";
import { conversation } from "@kepler-chat/db/schema/opencode";
import { eq } from "drizzle-orm";
import { opencodeManager } from "../services/opencode";
import { requireAuth } from "../middleware/auth";
import { generateId } from "../lib/id";
import {
  getConversationPlaygroundPath,
  getConversationRoot,
  provisionConversationDirectories,
} from "../lib/conversation-paths";
import { rm } from "node:fs/promises";

export const conversationsRoute = new Elysia({ prefix: "/api/conversations" })
  .get("/", async (context) => {
    const userId = await requireAuth(context);

    const conversations = await db.query.conversation.findMany({
      where: eq(conversation.user_id, userId),
      orderBy: (conversation, { desc }) => [desc(conversation.updated_at)],
    });

    return conversations;
  }, {
    detail: {
      summary: "List conversations",
      tags: ["Conversations"],
      description: "Get all conversations for the authenticated user",
    },
  })
  .post(
    "/",
    async (context) => {
      const userId = await requireAuth(context);
      const { title } = context.body;

      const conversationId = generateId();

      // Insert conversation row first — opencode_conversation_instance has an FK
      // to conversation.id, so the row must exist before getOrSpawn.
      await db.insert(conversation).values({
        id: conversationId,
        user_id: userId,
        opencode_session_id: "__pending__",
        title,
      });

      try {
        await provisionConversationDirectories(userId, conversationId);
        const playgroundPath = getConversationPlaygroundPath(userId, conversationId);

        const { client } = await opencodeManager.getOrSpawn(userId, conversationId);

        const { data: session, error } = await client.session.create({
          title,
          directory: playgroundPath,
        });

        if (error || !session) {
          throw new Error("Failed to create session");
        }

        await db
          .update(conversation)
          .set({
            opencode_session_id: session.id,
            title: session.title,
          })
          .where(eq(conversation.id, conversationId));

        return { id: conversationId, session };
      } catch (err) {
        // Clean up the conversation row if spawn/session creation fails
        await db.delete(conversation).where(eq(conversation.id, conversationId));
        throw err;
      }
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
  .get("/:id", async (context) => {
    const userId = await requireAuth(context);
    const { id } = context.params;

    const conv = await db.query.conversation.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.id, id), eq(fields.user_id, userId)),
    });

    if (!conv) {
      throw new Error("Conversation not found");
    }

    return conv;
  }, {
    params: t.Object({
      id: t.String(),
    }),
    detail: {
      summary: "Get conversation",
      tags: ["Conversations"],
      description: "Get a single conversation by ID",
    },
  })
  .delete("/:id", async (context) => {
    const userId = await requireAuth(context);
    const { id } = context.params;

    const conv = await db.query.conversation.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.id, id), eq(fields.user_id, userId)),
    });

    if (!conv) {
      throw new Error("Conversation not found");
    }

    await opencodeManager.teardown(id);

    const conversationRoot = getConversationRoot(userId, id);
    await rm(conversationRoot, { recursive: true, force: true });

    await db.delete(conversation).where(eq(conversation.id, id));

    return { success: true };
  }, {
    params: t.Object({
      id: t.String(),
    }),
    detail: {
      summary: "Delete conversation",
      tags: ["Conversations"],
      description: "Delete a conversation, its OpenCode session, instance, and files",
    },
  });
