import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { requireConversation } from "$lib/server/conversations";
import { listMessages } from "$lib/server/messages";
import {
  attachMessageStream,
  cancelGeneration,
  sendMessageStream,
} from "$lib/server/acp/pump";

export const messagesRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/messages",
    async (context) => {
      requireAuth(context);
      await requireConversation(context.params.id);
      return { messages: await listMessages(context.params.id) };
    },
    {
      params: t.Object({ id: t.String() }),
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
      params: t.Object({ id: t.String() }),
      body: t.Object({
        text: t.String(),
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
                  description: "Kepler stream events (message, part, delta, usage, turn.end, ...)",
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
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Attach to live generation",
        tags: ["Messages"],
        description:
          "Stream the remaining SSE events of an in-flight generation; 204 when idle",
      },
    },
  )

  .post(
    "/:id/abort",
    async (context) => {
      requireAuth(context);
      await requireConversation(context.params.id);
      await cancelGeneration(context.params.id);
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
