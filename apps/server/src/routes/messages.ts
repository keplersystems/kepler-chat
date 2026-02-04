import { Elysia, t } from "elysia";
import { db } from "@kepler-chat/db";
import { opencodeManager } from "../services/opencode";
import { requireAuth } from "../middleware/auth";
import type { Event, TextPartInput } from "@opencode-ai/sdk/v2";

function formatSSE(id: string, event: string, data: string): string {
  return `id: ${id}\nevent: ${event}\ndata: ${data}\n\n`;
}

function getSessionIdFromEvent(event: Event): string | undefined {
  switch (event.type) {
    case "message.updated":
      return event.properties.info.sessionID;
    case "message.removed":
      return event.properties.sessionID;
    case "message.part.updated":
      return event.properties.part.sessionID;
    case "message.part.removed":
      return event.properties.sessionID;
    default:
      return undefined;
  }
}

function isMessageComplete(event: Event): boolean {
  if (event.type !== "message.updated") return false;
  const info = event.properties.info;
  return "completed" in info.time && info.time.completed !== undefined;
}

export const messagesRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/messages",
    async (context) => {
      const userId = await requireAuth(context);
      const { id } = context.params;

      const conv = await db.query.conversation.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.id, id), eq(fields.user_id, userId)),
      });

      if (!conv) {
        throw new Error("Conversation not found");
      }

      const { client } = await opencodeManager.getOrSpawn(userId);
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
      const userId = await requireAuth(context);
      const { id } = context.params;
      const { text } = context.body;

      const conv = await db.query.conversation.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.id, id), eq(fields.user_id, userId)),
      });

      if (!conv) {
        throw new Error("Conversation not found");
      }

      const { client } = await opencodeManager.getOrSpawn(userId);
      const { stream: eventStream } = await client.event.subscribe();

      const parts: TextPartInput[] = [{ type: "text", text }];

      client.session
        .prompt({
          sessionID: conv.opencode_session_id,
          parts,
          model: {
            providerID: "opencode",
            modelID: "big-pickle",
          },
        })
        .catch((err) => {
          console.error("Prompt error:", err);
        });

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          const abortHandler = () => {
            controller.close();
          };
          context.request.signal.addEventListener("abort", abortHandler);

          try {
            for await (const event of eventStream) {
              if (context.request.signal.aborted) break;

              const eventSessionID = getSessionIdFromEvent(event);
              if (eventSessionID && eventSessionID !== conv.opencode_session_id) {
                continue;
              }

              if (
                event.type === "message.part.updated" ||
                event.type === "message.updated"
              ) {
                const sseMessage = formatSSE(
                  Date.now().toString(),
                  event.type,
                  JSON.stringify(event.properties),
                );
                controller.enqueue(encoder.encode(sseMessage));
              }

              if (isMessageComplete(event)) {
                break;
              }
            }
          } catch (error) {
            if (!context.request.signal.aborted) {
              const errorMessage = formatSSE(
                Date.now().toString(),
                "error",
                JSON.stringify({
                  message:
                    error instanceof Error ? error.message : "Unknown error",
                }),
              );
              controller.enqueue(encoder.encode(errorMessage));
            }
          } finally {
            context.request.signal.removeEventListener("abort", abortHandler);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        text: t.String({ minLength: 1 }),
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
                    "Events: message.part.updated, message.updated, error",
                },
              },
            },
          },
        },
      },
    },
  );
