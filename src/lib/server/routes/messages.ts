import { Elysia, t } from "elysia";
import { db } from "$lib/server/db/client";
import { conversation, conversationMessageModel } from "$lib/server/db/schema/opencode";
import { eq } from "drizzle-orm";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import { requireAuth } from "$lib/server/auth";
import type { Event, FilePartInput, TextPartInput } from "@opencode-ai/sdk/v2";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import {
  lookupMimeType,
  resolveExistingSafeFilePath,
  statOrNull,
} from "$lib/server/files";
import {
  getConversationInputPath,
} from "$lib/server/paths";
import { HttpError } from "$lib/server/http-error";
import {
  hasProviderModel,
  type ProviderModelCatalog,
} from "$lib/server/provider-models";

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

function getConversationTitleFromEvent(event: Event): string | null {
  if (event.type !== "message.updated") return null;

  const info = event.properties.info as {
    role?: string;
    summary?: { title?: string };
  };

  if (info.role !== "user") {
    return null;
  }

  const title = info.summary?.title?.trim();
  if (!title) {
    return null;
  }

  return title;
}

function formatSSE(id: string, event: string, data: string): string {
  return `id: ${id}\nevent: ${event}\ndata: ${data}\n\n`;
}

export const messagesRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/messages",
    async (context) => {
      requireAuth(context);
      const { id } = context.params;

      const conv = await db.query.conversation.findFirst({
        where: (fields, { eq }) => eq(fields.id, id),
      });

      if (!conv) {
        throw new HttpError(404, "Conversation not found");
      }

      const { client } = await opencodeServer.conversationClient(id);
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
      const { id } = context.params;
      const { text, model, attachments = [] } = context.body;

      const conv = await db.query.conversation.findFirst({
        where: (fields, { eq }) => eq(fields.id, id),
      });

      if (!conv) {
        throw new HttpError(404, "Conversation not found");
      }

      const { client } = await opencodeServer.conversationClient(id);
      const { data: providerCatalog, error: providerCatalogError } =
        await client.provider.list();
      if (providerCatalogError || !providerCatalog) {
        throw new Error("Failed to fetch provider catalog");
      }

      if (
        !hasProviderModel(
          providerCatalog.all as ProviderModelCatalog[],
          model.providerID,
          model.modelID,
        )
      ) {
        context.set.status = 400;
        return { error: "Invalid provider/model selection" };
      }

      if (!providerCatalog.connected.includes(model.providerID)) {
        context.set.status = 400;
        return { error: "Selected provider is not authenticated" };
      }

      const trimmedText = text.trim();
      if (trimmedText.length === 0 && attachments.length === 0) {
        context.set.status = 400;
        return { error: "Message text or attachment is required" };
      }

      const inputBasePath = getConversationInputPath(id);
      const fileParts: FilePartInput[] = [];
      for (const attachment of attachments) {
        let absolutePath: string;
        try {
          absolutePath = await resolveExistingSafeFilePath(inputBasePath, attachment.path);
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            context.set.status = 400;
            return { error: `Attachment not found: ${attachment.path}` };
          }
          context.set.status = 400;
          return { error: `Invalid attachment path: ${attachment.path}` };
        }

        const stats = await statOrNull(absolutePath);
        if (!stats || !stats.isFile()) {
          context.set.status = 400;
          return { error: `Attachment not found: ${attachment.path}` };
        }

        const detectedMimeType = lookupMimeType(absolutePath);
        const finalMimeType = attachment.mimeType?.trim() || detectedMimeType || "application/octet-stream";
        fileParts.push({
          type: "file",
          url: pathToFileURL(absolutePath).toString(),
          filename: attachment.filename?.trim() || basename(attachment.path),
          mime: finalMimeType,
        });
      }

      await db
        .update(conversation)
        .set({
          provider_id: model.providerID,
          model_id: model.modelID,
        })
        .where(eq(conversation.id, id));

      let conversationTitle = conv.title;

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

            const parts: Array<TextPartInput | FilePartInput> = [];
            if (trimmedText.length > 0) {
              parts.push({ type: "text", text: trimmedText });
            }
            parts.push(...fileParts);
            const promptPromise = (async () => {
              const result = await client.session.prompt({
                sessionID: conv.opencode_session_id,
                parts,
                model,
              });
              if (result.error || !result.data) {
                throw new Error("Failed to send prompt");
              }

              if ("info" in result.data && "parentID" in result.data.info) {
                const parentID = result.data.info.parentID;
                if (typeof parentID === "string" && parentID.length > 0) {
                  await db
                    .insert(conversationMessageModel)
                    .values({
                      conversation_id: id,
                      opencode_message_id: parentID,
                      provider_id: model.providerID,
                      model_id: model.modelID,
                    })
                    .onConflictDoNothing();
                }
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

              const generatedTitle = getConversationTitleFromEvent(event);
              if (
                generatedTitle &&
                generatedTitle !== conversationTitle
              ) {
                await db
                  .update(conversation)
                  .set({ title: generatedTitle })
                  .where(eq(conversation.id, id));
                conversationTitle = generatedTitle;
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
        text: t.String(),
        model: t.Object({
          providerID: t.String({ minLength: 1 }),
          modelID: t.String({ minLength: 1 }),
        }),
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
  );
