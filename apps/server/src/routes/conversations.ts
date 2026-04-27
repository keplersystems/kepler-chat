import { Elysia, t } from "elysia";
import { db } from "@kepler-chat/db";
import { conversation } from "@kepler-chat/db/schema/opencode";
import { eq } from "drizzle-orm";
import { opencodeServer } from "../services/opencode";
import { requireAuth } from "../middleware/auth";
import { generateId } from "../lib/id";
import {
  getConversationRoot,
  provisionConversationDirectories,
} from "../lib/conversation-paths";
import { rm } from "node:fs/promises";

export const conversationsRoute = new Elysia({ prefix: "/api/conversations" })
  .get("/", async (context) => {
    requireAuth(context);

    const conversations = await db.query.conversation.findMany({
      orderBy: (conversation, { desc }) => [desc(conversation.updated_at)],
    });

    return conversations;
  }, {
    detail: {
      summary: "List conversations",
      tags: ["Conversations"],
      description: "Get all conversations",
    },
  })
  .post(
    "/",
    async (context) => {
      requireAuth(context);
      const { title } = context.body;

      const conversationId = generateId();
      const conversationRoot = getConversationRoot(conversationId);
      let createdSessionId: string | null = null;

      try {
        await provisionConversationDirectories(conversationId);

        const { client } = await opencodeServer.conversationClient(conversationId);

        const { data: session, error } = await client.session.create({
          title,
        });

        if (error || !session) {
          throw new Error("Failed to create session");
        }
        createdSessionId = session.id;

        await db.insert(conversation).values({
          id: conversationId,
          opencode_session_id: session.id,
          title: session.title,
        });

        return { id: conversationId, session };
      } catch (err) {
        if (createdSessionId) {
          const { client } = await opencodeServer.conversationClient(conversationId);
          const { error } = await client.session.delete({
            sessionID: createdSessionId,
          });
          if (error) {
            throw new AggregateError(
              [err, error],
              "Failed to create conversation and clean up OpenCode session",
            );
          }
        }

        await rm(conversationRoot, { recursive: true, force: true });
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
    requireAuth(context);
    const { id } = context.params;

    const conv = await db.query.conversation.findFirst({
      where: (fields, { eq }) => eq(fields.id, id),
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
    requireAuth(context);
    const { id } = context.params;

    const conv = await db.query.conversation.findFirst({
      where: (fields, { eq }) => eq(fields.id, id),
    });

    if (!conv) {
      throw new Error("Conversation not found");
    }

    const conversationRoot = getConversationRoot(id);
    const { client } = await opencodeServer.conversationClient(id);
    const { error } = await client.session.delete({
      sessionID: conv.opencode_session_id,
    });
    if (error) {
      throw new Error("Failed to delete OpenCode session");
    }

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
      description: "Delete a conversation, its OpenCode session, and files",
    },
  });
