import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  Event,
  FilePartInput,
  OpencodeClient,
  Provider,
  TextPartInput,
} from "@opencode-ai/sdk/v2";
import { eq } from "drizzle-orm";
import type {
  EventPayload,
  SendMessageInput,
  ServerEventName,
} from "$lib/contracts";
import { isRealSessionTitle, isTerminalFinish } from "$lib/messages";
import type { ModelSelection } from "$lib/types";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/opencode";
import {
  isEnoent,
  lookupMimeType,
  resolveExistingSafeFilePath,
  statOrNull,
} from "$lib/server/files";
import { HttpError } from "$lib/server/http-error";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import { getConversationInputPath } from "$lib/server/paths";

type ConversationRow = typeof conversation.$inferSelect;

function hasProviderModel(
  providers: Provider[],
  providerId: string,
  modelId: string,
): boolean {
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) return false;
  return (
    modelId in provider.models ||
    Object.values(provider.models).some((model) => model.id === modelId)
  );
}

async function requireValidModel(
  client: OpencodeClient,
  model: ModelSelection,
): Promise<void> {
  const { data: catalog, error } = await client.provider.list();
  if (error || !catalog) throw new Error("Failed to fetch provider catalog");
  if (!hasProviderModel(catalog.all, model.providerID, model.modelID)) {
    throw new HttpError(400, "Invalid provider/model selection");
  }
  if (!catalog.connected.includes(model.providerID)) {
    throw new HttpError(400, "Selected provider is not authenticated");
  }
}

async function persistModel(
  conversationId: string,
  model: ModelSelection,
): Promise<void> {
  await db
    .update(conversation)
    .set({ provider_id: model.providerID, model_id: model.modelID })
    .where(eq(conversation.id, conversationId));
}

export async function setConversationModel(
  conv: ConversationRow,
  model: ModelSelection,
): Promise<void> {
  const { client } = await opencodeServer.conversationClient(conv);
  await requireValidModel(client, model);
  await persistModel(conv.id, model);
}

async function resolveAttachmentParts(
  conv: ConversationRow,
  attachments: NonNullable<SendMessageInput["attachments"]>,
): Promise<FilePartInput[]> {
  const inputBasePath = getConversationInputPath(conv);
  const parts: FilePartInput[] = [];
  for (const attachment of attachments) {
    let absolutePath: string;
    try {
      absolutePath = await resolveExistingSafeFilePath(inputBasePath, attachment.path);
    } catch (error) {
      throw new HttpError(
        400,
        isEnoent(error)
          ? `Attachment not found: ${attachment.path}`
          : `Invalid attachment path: ${attachment.path}`,
      );
    }

    const stats = await statOrNull(absolutePath);
    if (!stats?.isFile()) {
      throw new HttpError(400, `Attachment not found: ${attachment.path}`);
    }

    parts.push({
      type: "file",
      url: pathToFileURL(absolutePath).toString(),
      filename: attachment.filename?.trim() || basename(attachment.path),
      mime:
        attachment.mimeType?.trim() ||
        lookupMimeType(absolutePath) ||
        "application/octet-stream",
    });
  }
  return parts;
}

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
  "session.updated": (p) => p.info.id,
  "session.error": (p) => p.sessionID,
  "todo.updated": (p) => p.sessionID,
  "command.executed": (p) => p.sessionID,
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
  return isTerminalFinish(info.finish);
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

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

interface GenerationEvent {
  event: string;
  data: unknown;
}

interface Generation {
  log: GenerationEvent[];
  listeners: Set<(entry: GenerationEvent | null) => void>;
  done: boolean;
}

/**
 * In-flight generations by conversation id. Each pump is detached from the
 * HTTP request that started it: in-flight delta text exists only on the event
 * stream (OpenCode's store flushes parts at boundaries), so the full event
 * log is retained here for clients that reattach mid-run.
 */
const generations = new Map<string, Generation>();

function broadcast(generation: Generation, entry: GenerationEvent): void {
  generation.log.push(entry);
  for (const listener of generation.listeners) listener(entry);
}

/** Start the server-owned event pump for a prompt; runs to completion regardless of clients. */
function startGeneration(
  conv: ConversationRow,
  client: OpencodeClient,
  prompt: {
    parts: Array<TextPartInput | FilePartInput>;
    model: ModelSelection;
    variant?: string;
  },
): Generation {
  const generation: Generation = { log: [], listeners: new Set(), done: false };
  generations.set(conv.id, generation);
  const titles = titleSync(conv);
  const emit = (event: string, data: unknown) => broadcast(generation, { event, data });
  const abortController = new AbortController();

  void (async () => {
    try {
      const { stream: eventStream } = await client.event.subscribe(undefined, {
        signal: abortController.signal,
      });

      const promptPromise = client.session
        .prompt({ sessionID: conv.opencode_session_id, ...prompt })
        .then((result) => {
          if (result.error || !result.data) {
            throw new Error("Failed to send prompt");
          }
        });
      const promptGuard = promptPromise.catch((err) => {
        emit("error", {
          message: err instanceof Error ? err.message : "Unknown error",
        });
      });
      // Backstop: the prompt resolves when generation ends; close the
      // subscription then in case no terminal message event arrives.
      void promptPromise.catch(() => {}).finally(() => abortController.abort());

      for await (const event of eventStream) {
        if (getSessionIdFromEvent(event) !== conv.opencode_session_id) continue;
        await titles.fromEvent(event);
        emit(event.type, event.properties);
        if (isMessageComplete(event)) break;
      }

      await promptGuard;
      await titles.final(client, emit);
    } catch (error) {
      if (!abortController.signal.aborted) {
        emit("error", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } finally {
      abortController.abort();
      generation.done = true;
      generations.delete(conv.id);
      for (const listener of generation.listeners) listener(null);
      generation.listeners.clear();
    }
  })();

  return generation;
}

/** SSE response replaying a generation's log, then following it live. */
function subscribeGeneration(
  generation: Generation,
  requestSignal: AbortSignal,
): Response {
  return sseStreamResponse(requestSignal, ({ emit }) => {
    // Replay + listener registration is synchronous, so no event can land
    // between the two.
    for (const entry of generation.log) emit(entry.event, entry.data);
    if (generation.done) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const finish = () => {
        generation.listeners.delete(listener);
        requestSignal.removeEventListener("abort", finish);
        resolve();
      };
      const listener = (entry: GenerationEvent | null) => {
        if (entry === null) {
          finish();
          return;
        }
        emit(entry.event, entry.data);
      };
      generation.listeners.add(listener);
      requestSignal.addEventListener("abort", finish);
    });
  });
}

function titleSync(conv: ConversationRow) {
  let current = conv.title;
  const persist = async (title: string) => {
    await db.update(conversation).set({ title }).where(eq(conversation.id, conv.id));
    current = title;
  };
  return {
    async fromEvent(event: Event) {
      const title = getConversationTitleFromEvent(event);
      if (title && title !== current) await persist(title);
    },
    // Title generation is async in OpenCode and may land after the final
    // message event; sync it once before closing the stream.
    async final(client: OpencodeClient, emit: (event: string, data: unknown) => void) {
      const { data: session } = await client.session.get({
        sessionID: conv.opencode_session_id,
      });
      const finalTitle = session?.title?.trim();
      if (isRealSessionTitle(finalTitle) && finalTitle !== current) {
        await persist(finalTitle);
        emit("session.updated", { info: session });
      }
    },
  };
}

interface SSEStreamContext {
  emit: (event: string, data: unknown) => void;
}

/**
 * SSE response scaffolding shared by send and attach. A client disconnect
 * reaches us twice — the request signal aborts AND the runtime cancels the
 * stream (closing the controller itself) — so close/enqueue are gated on
 * controller state, not just our own flag.
 */
function sseStreamResponse(
  requestSignal: AbortSignal,
  run: (context: SSEStreamContext) => Promise<void>,
): Response {
  let closed = false;
  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (event: string, data: unknown) => {
        if (closed || controller.desiredSize === null) return;
        controller.enqueue(
          encoder.encode(formatSSE(Date.now().toString(), event, JSON.stringify(data))),
        );
      };
      const closeStream = () => {
        if (closed) return;
        closed = true;
        if (controller.desiredSize !== null) controller.close();
      };
      const abortHandler = () => {
        abortController.abort();
        closeStream();
      };
      requestSignal.addEventListener("abort", abortHandler);

      try {
        await run({ emit });
      } catch (error) {
        if (!requestSignal.aborted && !abortController.signal.aborted) {
          emit("error", {
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } finally {
        requestSignal.removeEventListener("abort", abortHandler);
        abortController.abort();
        closeStream();
      }
    },
    cancel() {
      closed = true;
      abortController.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function sendMessageStream(
  conv: ConversationRow,
  input: SendMessageInput,
  requestSignal: AbortSignal,
): Promise<Response> {
  const { text, model, variant, attachments = [] } = input;

  if (generations.has(conv.id)) {
    throw new HttpError(409, "A response is already streaming for this conversation");
  }

  const { client } = await opencodeServer.conversationClient(conv);
  await requireValidModel(client, model);

  const trimmedText = text.trim();
  if (trimmedText.length === 0 && attachments.length === 0) {
    throw new HttpError(400, "Message text or attachment is required");
  }

  const parts: Array<TextPartInput | FilePartInput> = [];
  if (trimmedText.length > 0) {
    parts.push({ type: "text", text: trimmedText });
  }
  parts.push(...(await resolveAttachmentParts(conv, attachments)));

  await persistModel(conv.id, model);

  const generation = startGeneration(conv, client, { parts, model, variant });
  return subscribeGeneration(generation, requestSignal);
}

/**
 * Reattach to a generation started by an earlier request (e.g. after a page
 * reload): replay everything it has streamed so far, then follow it live.
 * 204 when nothing is generating.
 */
export function attachMessageStream(
  conv: ConversationRow,
  requestSignal: AbortSignal,
): Response {
  const generation = generations.get(conv.id);
  if (!generation) return new Response(null, { status: 204 });
  return subscribeGeneration(generation, requestSignal);
}
