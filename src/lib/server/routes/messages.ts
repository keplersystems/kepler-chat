import { Elysia, t } from "elysia";
import { db } from "$lib/server/db/client";
import { conversation, conversationMessageModel } from "$lib/server/db/schema/opencode";
import { eq } from "drizzle-orm";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import { requireAuth } from "$lib/server/auth";
import {
  deleteConversationMessage,
  requireConversation,
} from "$lib/server/conversations";
import type { Event, FilePartInput, TextPartInput } from "@opencode-ai/sdk/v2";
import type { EventPayload, ServerEventName } from "$lib/contracts";
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
import {
  hasProviderModel,
  type ProviderModelCatalog,
} from "$lib/server/provider-models";
import { isRealSessionTitle } from "$lib/messages";

/**
 * Session id extractor per forwarded event, exhaustive over the shared
 * SERVER_EVENT_NAMES contract so the client and server can never drift.
 */
const sessionIdOf: {
  [K in ServerEventName]: (properties: EventPayload<K>) => string | undefined;
} = {
  "message.updated": (p) => p.sessionID,
  "message.removed": (p) => p.sessionID,
  "message.part.updated": (p) => p.part.sessionID,
  "message.part.delta": (p) => p.sessionID,
  "message.part.removed": (p) => p.sessionID,
  "permission.asked": (p) => p.sessionID,
  "permission.replied": (p) => p.sessionID,
  "question.asked": (p) => p.sessionID,
  "question.replied": (p) => p.sessionID,
  "question.rejected": (p) => p.sessionID,
  "session.created": (p) => p.info.id,
  "session.updated": (p) => p.info.id,
  "session.deleted": (p) => p.info.id,
  "session.status": (p) => p.sessionID,
  "session.idle": (p) => p.sessionID,
  "session.compacted": (p) => p.sessionID,
  "session.diff": (p) => p.sessionID,
  "session.error": (p) => p.sessionID,
  "todo.updated": (p) => p.sessionID,
  "command.executed": (p) => p.sessionID,
  "tui.session.select": (p) => p.sessionID,
};

function getSessionIdFromEvent(event: Event): string | undefined {
  const extract = (
    sessionIdOf as Partial<Record<Event["type"], (properties: unknown) => string | undefined>>
  )[event.type];
  return extract?.(event.properties);
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
  if (event.type === "session.updated") {
    const title = event.properties.info.title?.trim();
    return isRealSessionTitle(title) ? title : null;
  }
  if (event.type !== "message.updated") return null;
  const info = event.properties.info;
  if (info.role !== "user") return null;
  return info.summary?.title?.trim() || null;
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

      const conv = await requireConversation(id);

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
      const { id } = context.params;
      const { text, model, variant, attachments = [] } = context.body;

      const conv = await requireConversation(id);

      const { client } = await opencodeServer.conversationClient(conv);
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

      const inputBasePath = getConversationInputPath(conv);
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
                variant,
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

            // Title generation is async in OpenCode and may land after the
            // final message event; sync it once before closing the stream.
            const { data: session } = await client.session.get({
              sessionID: conv.opencode_session_id,
            });
            const finalTitle = session?.title?.trim();
            if (isRealSessionTitle(finalTitle) && finalTitle !== conversationTitle) {
              await db
                .update(conversation)
                .set({ title: finalTitle })
                .where(eq(conversation.id, id));
              conversationTitle = finalTitle;
              const sseMessage = formatSSE(
                Date.now().toString(),
                "session.updated",
                JSON.stringify({ info: session }),
              );
              controller.enqueue(encoder.encode(sseMessage));
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
