import { Elysia, t } from "elysia";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import { requireAuth } from "$lib/server/auth";
import {
  deleteConversationMessage,
  requireConversation,
} from "$lib/server/conversations";
import { attachMessageStream, sendMessageStream } from "$lib/server/messages";

export const messagesRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/messages",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);

      const { client } = await opencodeServer.conversationClient(conv);
      const { data: messages, error } = await client.session.messages({
        sessionID: conv.opencode_session_id,
      });

      if (error || !messages) {
        throw new Error("Failed to fetch messages");
      }

      return messages;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Get messages",
        tags: ["Messages"],
        description: "Get all messages in a conversation",
      },
    },
  )
  .post(
    "/:id/messages",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      return sendMessageStream(conv, context.body, context.request.signal);
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        text: t.String(),
        model: t.Object({
          providerID: t.String({ minLength: 1 }),
          modelID: t.String({ minLength: 1 }),
        }),
        variant: t.Optional(t.String({ minLength: 1 })),
        attachments: t.Optional(
          t.Array(
            t.Object({
              path: t.String({ minLength: 1 }),
              mimeType: t.Optional(t.String({ minLength: 1 })),
              filename: t.Optional(t.String({ minLength: 1 })),
            }),
          ),
        ),
      }),
      detail: {
        summary: "Send message",
        tags: ["Messages"],
        description: "Send a message and stream the response via SSE",
        responses: {
          200: {
            description: "SSE stream of message events",
            content: {
              "text/event-stream": {
                schema: {
                  type: "object",
                  description:
                    "Events: all session-scoped event types plus error",
                },
              },
            },
          },
        },
      },
    },
  )
  .get(
    "/:id/messages/live",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      return attachMessageStream(conv, context.request.signal);
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Attach to live generation",
        tags: ["Messages"],
        description:
          "Stream the remaining SSE events of an in-flight generation; 204 when idle",
      },
    },
  )
  .delete(
    "/:id/messages/:messageID",
    async (context) => {
      requireAuth(context);
      await deleteConversationMessage(context.params.id, context.params.messageID);
      return { success: true as const };
    },
    {
      params: t.Object({ id: t.String(), messageID: t.String() }),
      detail: {
        summary: "Delete message",
        tags: ["Messages"],
        description: "Delete a message from the conversation's OpenCode session",
      },
    },
  )
  .post(
    "/:id/abort",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      const { client } = await opencodeServer.conversationClient(conv);
      const { error } = await client.session.abort({ sessionID: conv.opencode_session_id });
      if (error) throw new Error("Failed to abort session");
      return { success: true as const };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Abort generation",
        tags: ["Messages"],
        description: "Stop the in-flight assistant response for a conversation",
      },
    },
  );
