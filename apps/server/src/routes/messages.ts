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
    case "message.part.delta":
      return event.properties.sessionID;
    case "message.part.removed":
      return event.properties.sessionID;
    case "permission.asked":
      return event.properties.sessionID;
    case "permission.replied":
      return event.properties.sessionID;
    case "question.asked":
      return event.properties.sessionID;
    case "question.replied":
      return event.properties.sessionID;
    case "question.rejected":
      return event.properties.sessionID;
    case "session.status":
      return event.properties.sessionID;
    case "session.idle":
      return event.properties.sessionID;
    case "session.compacted":
      return event.properties.sessionID;
    case "todo.updated":
      return event.properties.sessionID;
    case "session.created":
    case "session.updated":
    case "session.deleted":
      return event.properties.info.id;
    case "session.diff":
      return event.properties.sessionID;
    case "command.executed":
      return event.properties.sessionID;
    case "session.error":
      return event.properties.sessionID;
    case "tui.session.select":
      return event.properties.sessionID;
    default:
      return undefined;
  }
}

function isMessageComplete(event: Event): boolean {
  if (event.type !== "message.updated") return false;
  const info = event.properties.info;
  if (info.role !== "assistant") return false;
  if (!("completed" in info.time) || info.time.completed === undefined) {
    return false;
  }
  if (!info.finish) return false;
  return !["tool-calls", "unknown"].includes(info.finish);
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

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let closed = false;
          const abortController = new AbortController();

          const closeStream = () => {
            if (closed) return;
            closed = true;
            controller.close();
          };

          const abortHandler = () => {
            abortController.abort();
            closeStream();
          };
          context.request.signal.addEventListener("abort", abortHandler);

          try {
            const { stream: eventStream } = await client.event.subscribe(
              undefined,
              {
                signal: abortController.signal,
              },
            );

            const parts: TextPartInput[] = [{ type: "text", text }];
            const promptPromise = (async () => {
              const result = await client.session.prompt({
                sessionID: conv.opencode_session_id,
                parts,
                model: {
                  providerID: "opencode",
                  modelID: "big-pickle",
                },
              });
              if (result.error || !result.data) {
                throw new Error(
                  result.error?.message ?? "Failed to send prompt",
                );
              }
              return result.data;
            })();
            const promptGuard = promptPromise.catch((err) => {
              if (context.request.signal.aborted) {
                return;
              }
              const errorMessage = formatSSE(
                Date.now().toString(),
                "error",
                JSON.stringify({
                  message: err instanceof Error ? err.message : "Unknown error",
                }),
              );
              controller.enqueue(encoder.encode(errorMessage));
              abortController.abort();
            });

            for await (const event of eventStream) {
              if (context.request.signal.aborted) break;

              const eventSessionID = getSessionIdFromEvent(event);
              if (!eventSessionID) {
                continue;
              }
              if (eventSessionID !== conv.opencode_session_id) {
                continue;
              }

              const sseMessage = formatSSE(
                Date.now().toString(),
                event.type,
                JSON.stringify(event.properties),
              );
              controller.enqueue(encoder.encode(sseMessage));

              if (isMessageComplete(event)) {
                break;
              }
            }

            await promptGuard;
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
            abortController.abort();
            closeStream();
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
                    "Events: all session-scoped event types plus error",
                },
              },
            },
          },
        },
      },
    },
  );
