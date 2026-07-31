// Engine-agnostic turn orchestration: persists the user message, hands the
// driver a TurnSink, persists streamed parts incrementally, normalizes
// usage/cost, and broadcasts Kepler SSE events from the replayable log.

import { open, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { downloadFileUrl, fileModality, isModelOption } from "$lib/contracts";
import type {
  MessageView,
  PartView,
  SendMessageInput,
  StopReason,
  TurnTokens,
} from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { conversation, message, part } from "$lib/server/db/schema/kepler";
import {
  isEnoent,
  listFilesRecursive,
  lookupMimeType,
  resolveExistingSafeFilePath,
  statOrNull,
} from "$lib/server/files";
import { HttpError } from "$lib/server/http-error";
import { generateId } from "$lib/server/ids";
import {
  getConversationInputPath,
  getConversationOutputPath,
  getConversationRoot,
} from "$lib/server/paths";
import type {
  ConversationRow,
  ResolvedAttachment,
  ToolPartUpdate,
  TurnSink,
} from "../types";
import { driverFor } from "../registry";
import { cancelPendingRequests } from "./requests";
import {
  broadcast,
  finishGeneration,
  hasGeneration,
  startGenerationLog,
  subscribeGeneration,
} from "./stream-hub";

const DELTA_FLUSH_MS = 300;
/** Text beyond this is embedded by reference, so counting its lines is wasted work. */
const EMBED_TEXT_LIMIT = 262144;
const DEFAULT_TITLE = "New Chat";

interface StreamingPart {
  view: PartView;
  dirty: boolean;
  persisted: boolean;
}

class AssistantAccumulator {
  readonly messageId = generateId();
  readonly createdAt = Date.now();
  engineMessageId: string | null = null;
  private parts: StreamingPart[] = [];
  private announced = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly conv: ConversationRow,
    private readonly modelValue: string | null,
  ) {}

  private async announce(): Promise<void> {
    if (this.announced) return;
    this.announced = true;
    await db.insert(message).values({
      id: this.messageId,
      conversation_id: this.conv.id,
      role: "assistant",
      model_value: this.modelValue,
      created_at: new Date(this.createdAt),
    });
    broadcast(this.conv.id, "message", { message: this.view() });
    this.flushTimer = setInterval(() => void this.flushDirty(), DELTA_FLUSH_MS);
  }

  view(): MessageView {
    return {
      id: this.messageId,
      role: "assistant",
      parts: this.parts.map((entry) => entry.view),
      modelValue: this.modelValue ?? undefined,
      createdAt: this.createdAt,
      engineMessageId: this.engineMessageId ?? undefined,
    };
  }

  private last(): StreamingPart | null {
    return this.parts.at(-1) ?? null;
  }

  private async pushPart(view: PartView): Promise<StreamingPart> {
    await this.announce();
    const entry: StreamingPart = { view, dirty: true, persisted: false };
    this.parts.push(entry);
    broadcast(this.conv.id, "part", {
      messageId: this.messageId,
      index: this.parts.length - 1,
      part: view,
    });
    return entry;
  }

  async appendText(kind: "text" | "reasoning", text: string): Promise<void> {
    if (!text) return;
    const last = this.last();
    if (last && last.view.type === kind) {
      last.view.text += text;
      last.dirty = true;
      broadcast(this.conv.id, "delta", {
        messageId: this.messageId,
        partId: last.view.id,
        text,
      });
      return;
    }
    await this.pushPart({ id: generateId(), type: kind, text });
  }

  async appendFile(view: Extract<PartView, { type: "file" }>): Promise<void> {
    await this.pushPart(view);
  }

  async upsertToolCall(update: ToolPartUpdate): Promise<void> {
    const existing = this.parts.find(
      (entry) => entry.view.type === "tool" && entry.view.toolCallId === update.toolCallId,
    );
    if (!existing) {
      await this.pushPart({
        id: generateId(),
        type: "tool",
        toolCallId: update.toolCallId,
        title: update.title ?? update.toolCallId,
        kind: update.kind ?? "other",
        status: update.status ?? "pending",
        content: update.content ?? [],
        locations: update.locations ?? [],
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      });
      return;
    }
    const view = existing.view as Extract<PartView, { type: "tool" }>;
    if (update.title != null) view.title = update.title;
    if (update.kind != null) view.kind = update.kind;
    if (update.status != null) view.status = update.status;
    if (update.content != null) view.content = update.content;
    if (update.locations != null) view.locations = update.locations;
    if (update.rawInput !== undefined) view.rawInput = update.rawInput;
    if (update.rawOutput !== undefined) view.rawOutput = update.rawOutput;
    existing.dirty = true;
    broadcast(this.conv.id, "part", {
      messageId: this.messageId,
      index: this.parts.indexOf(existing),
      part: view,
    });
    await this.flushPart(existing);
  }

  private async flushPart(entry: StreamingPart): Promise<void> {
    if (!entry.dirty) return;
    entry.dirty = false;
    const ord = this.parts.indexOf(entry);
    const row = {
      message_id: this.messageId,
      conversation_id: this.conv.id,
      ord,
      type: entry.view.type,
      content: JSON.stringify(entry.view),
      text: partText(entry.view),
    };
    if (entry.persisted) {
      await db.update(part).set(row).where(eq(part.id, entry.view.id));
    } else {
      entry.persisted = true;
      await db.insert(part).values({ id: entry.view.id, ...row });
    }
  }

  async flushDirty(): Promise<void> {
    for (const entry of this.parts) {
      if (entry.dirty) await this.flushPart(entry);
    }
  }

  async finalize(fields: {
    stopReason: StopReason;
    error?: string;
    cost?: number;
    tokens?: TurnTokens;
  }): Promise<MessageView | null> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    // A turn that ends without producing anything is still an outcome. Dropping
    // it leaves the thread sitting on a reply that is never coming.
    const error =
      fields.error ?? (this.announced ? undefined : "The model returned an empty response.");
    await this.announce();
    // A turn can end while tool calls are still open (cancel, agent crash);
    // leaving them pending would render as perpetually in-flight.
    if (fields.stopReason !== "end_turn") {
      for (const entry of this.parts) {
        if (entry.view.type !== "tool") continue;
        if (entry.view.status === "completed" || entry.view.status === "failed") continue;
        entry.view.status = "failed";
        entry.dirty = true;
        broadcast(this.conv.id, "part", {
          messageId: this.messageId,
          index: this.parts.indexOf(entry),
          part: entry.view,
        });
      }
    }
    await this.flushDirty();
    await db
      .update(message)
      .set({
        engine_message_id: this.engineMessageId,
        stop_reason: fields.stopReason,
        error: error ?? null,
        cost: fields.cost ?? null,
        tokens: fields.tokens ? JSON.stringify(fields.tokens) : null,
        completed_at: new Date(),
      })
      .where(eq(message.id, this.messageId));
    return {
      ...this.view(),
      stopReason: fields.stopReason,
      error,
      cost: fields.cost,
      tokens: fields.tokens,
      completedAt: Date.now(),
    };
  }
}

function partText(view: PartView): string {
  switch (view.type) {
    case "text":
    case "reasoning":
      return view.text;
    case "tool":
      return view.content
        .map((item) => (item.type === "text" ? item.text : item.newText))
        .join("\n");
    case "file":
      return view.filename;
  }
}

/**
 * Agents report usage either cumulatively across the session or per turn; a
 * value below the stored snapshot means the agent already reports per turn.
 */
function perTurnDelta(current: number, previous: number): number {
  return current >= previous ? current - previous : current;
}

function turnTokenDelta(current: TurnTokens, previous: TurnTokens | null): TurnTokens {
  if (!previous) return current;
  const delta = (now: number | undefined, prev: number | undefined): number | undefined =>
    now === undefined ? undefined : perTurnDelta(now, prev ?? 0);
  return {
    input: delta(current.input, previous.input) ?? 0,
    output: delta(current.output, previous.output) ?? 0,
    thought: delta(current.thought, previous.thought),
    cacheRead: delta(current.cacheRead, previous.cacheRead),
    cacheWrite: delta(current.cacheWrite, previous.cacheWrite),
    total: delta(current.total, previous.total) ?? 0,
  };
}

async function persistUserMessage(
  conv: ConversationRow,
  input: SendMessageInput,
  attachments: ResolvedAttachment[],
): Promise<MessageView> {
  const messageId = generateId();
  const createdAt = Date.now();
  const parts: PartView[] = [];
  if (input.text.trim()) {
    parts.push({ id: generateId(), type: "text", text: input.text.trim() });
  }
  for (const attachment of attachments) {
    parts.push({
      id: generateId(),
      type: "file",
      url: downloadFileUrl(conv.id, attachment.relativePath, "input"),
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      ...(attachment.lines === undefined ? {} : { lines: attachment.lines }),
    });
  }
  await db.insert(message).values({
    id: messageId,
    conversation_id: conv.id,
    role: "user",
    created_at: new Date(createdAt),
    completed_at: new Date(createdAt),
  });
  await db.insert(part).values(
    parts.map((view, ord) => ({
      id: view.id,
      message_id: messageId,
      conversation_id: conv.id,
      ord,
      type: view.type,
      content: JSON.stringify(view),
      text: partText(view),
    })),
  );
  return { id: messageId, role: "user", parts, createdAt, completedAt: createdAt };
}

/**
 * Browsers report the OS mime database, which labels plenty of text formats
 * with exotic types (Linux calls a `.tsx` a Tiled tileset). Providers reject
 * what they do not recognise, and a rejected part stays in the transcript and
 * is replayed on every later turn, so one bad upload never stops failing.
 * A mime is only worth relaying when it names a modality the model can act on;
 * otherwise the file is described by what its bytes actually are, and text
 * carries its length so the chip can say how much there is to read.
 */
async function describeFile(
  reported: string | undefined,
  path: string,
  size: number,
): Promise<{ mimeType: string; lines?: number }> {
  for (const candidate of [reported?.trim(), lookupMimeType(path)]) {
    if (candidate && fileModality(candidate)) return { mimeType: candidate };
  }
  const handle = await open(path);
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4096), 0, 4096, 0);
    if (buffer.subarray(0, bytesRead).includes(0)) return { mimeType: "application/octet-stream" };
  } finally {
    await handle.close();
  }
  if (size > EMBED_TEXT_LIMIT) return { mimeType: "text/plain" };
  const text = await readFile(path, "utf8");
  const lines = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
  return { mimeType: "text/plain", lines };
}

/**
 * Files the agent wrote during this turn, so its own output is readable in the
 * reply instead of only in the side panel. Keyed by size and mtime, which is
 * what distinguishes a rewritten file from an untouched one.
 */
async function snapshotOutputs(conv: ConversationRow): Promise<Map<string, string>> {
  // Root-relative, matching the download route, whose `output` scope resolves
  // against the conversation root rather than the output directory.
  const entries = await listFilesRecursive(
    getConversationRoot(conv),
    getConversationOutputPath(conv),
  ).catch(() => []);
  return new Map(
    entries.filter((entry) => !entry.isDir).map((entry) => [entry.path, `${entry.size}:${entry.mtime}`]),
  );
}

async function outputsWrittenSince(
  conv: ConversationRow,
  before: Map<string, string>,
): Promise<Array<Extract<PartView, { type: "file" }>>> {
  const root = getConversationRoot(conv);
  const parts: Array<Extract<PartView, { type: "file" }>> = [];
  for (const [path, stamp] of await snapshotOutputs(conv)) {
    if (before.get(path) === stamp) continue;
    const absolutePath = resolve(root, path);
    const stats = await statOrNull(absolutePath);
    if (!stats?.isFile()) continue;
    parts.push({
      id: generateId(),
      type: "file",
      url: downloadFileUrl(conv.id, path, "output"),
      filename: basename(path),
      ...(await describeFile(undefined, absolutePath, stats.size)),
    });
  }
  return parts;
}

async function resolveAttachments(
  conv: ConversationRow,
  attachments: NonNullable<SendMessageInput["attachments"]>,
): Promise<ResolvedAttachment[]> {
  const inputBasePath = getConversationInputPath(conv);
  const resolved: ResolvedAttachment[] = [];
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
    resolved.push({
      absolutePath,
      relativePath: attachment.path,
      filename: attachment.filename?.trim() || basename(attachment.path),
      ...(await describeFile(attachment.mimeType, absolutePath, stats.size)),
    });
  }
  return resolved;
}

interface TurnState {
  cancelled: boolean;
  controller: AbortController;
}

const activeTurns = new Map<string, TurnState>();

export async function cancelGeneration(conversationId: string): Promise<void> {
  const state = activeTurns.get(conversationId);
  if (!state) return;
  state.cancelled = true;
  state.controller.abort();
}

async function refreshTitle(
  conv: ConversationRow,
  engineTitle: string | null,
  userText: string,
): Promise<void> {
  let title = engineTitle?.trim() || null;
  if (!title && conv.title === DEFAULT_TITLE && userText.trim()) {
    title = userText.trim().slice(0, 60);
  }
  if (title && title !== conv.title) {
    await db.update(conversation).set({ title }).where(eq(conversation.id, conv.id));
    conv.title = title;
    broadcast(conv.id, "title", { title });
  }
}

function runTurn(conv: ConversationRow, input: SendMessageInput): void {
  const state: TurnState = { cancelled: false, controller: new AbortController() };
  activeTurns.set(conv.id, state);
  const driver = driverFor(conv.agent_id);

  void (async () => {
    let accumulator: AssistantAccumulator | null = null;
    let userMessageId: string | null = null;

    try {
      const attachments = await resolveAttachments(conv, input.attachments ?? []);
      const userView = await persistUserMessage(conv, input, attachments);
      userMessageId = userView.id;
      broadcast(conv.id, "message", { message: userView });

      const config = await driver.ensureSession(conv);
      broadcast(conv.id, "config", config);

      const modelOption = config.configOptions.find(
        (option) => isModelOption(option) && option.type === "select",
      );
      const modelValue =
        (modelOption?.type === "select" ? modelOption.currentValue : null) ?? conv.model_value;
      accumulator = new AssistantAccumulator(conv, modelValue ?? null);
      const acc = accumulator;

      const sink: TurnSink = {
        appendText: (kind, text) => acc.appendText(kind, text),
        upsertToolCall: (update) => acc.upsertToolCall(update),
        emit: (event, data) => broadcast(conv.id, event, data),
        setEngineMessageId: (id) => {
          acc.engineMessageId = id;
        },
        setUserEngineMessageId: (id) => {
          if (!userMessageId) return;
          void db
            .update(message)
            .set({ engine_message_id: id })
            .where(eq(message.id, userMessageId));
        },
      };

      const outputsBefore = await snapshotOutputs(conv);
      const result = await driver.runTurn(
        conv,
        { text: input.text.trim(), attachments },
        sink,
        state.controller.signal,
      );
      for (const file of await outputsWrittenSince(conv, outputsBefore)) {
        await acc.appendFile(file);
      }

      const stopReason: StopReason = state.cancelled ? "cancelled" : result.stopReason;

      const previousTokens = conv.total_tokens
        ? (JSON.parse(conv.total_tokens) as TurnTokens)
        : null;
      const tokens = result.tokens
        ? result.cumulativeTokens
          ? turnTokenDelta(result.tokens, previousTokens)
          : result.tokens
        : undefined;

      let costDelta: number | undefined = result.costUsd ?? undefined;
      const newTotalCost = conv.total_cost + (costDelta ?? 0);

      const finalView = await accumulator.finalize({ stopReason, tokens, cost: costDelta });

      await db
        .update(conversation)
        .set({
          context_used: result.context?.used ?? conv.context_used,
          context_size: result.context?.size ?? conv.context_size,
          total_cost: newTotalCost,
          total_tokens:
            result.tokens && result.cumulativeTokens
              ? JSON.stringify(result.tokens)
              : conv.total_tokens,
        })
        .where(eq(conversation.id, conv.id));
      if (result.context) {
        broadcast(conv.id, "usage", {
          used: result.context.used,
          size: result.context.size,
          cost: newTotalCost,
        });
      }

      await refreshTitle(conv, result.title, input.text);
      broadcast(conv.id, "turn.end", { stopReason, message: finalView });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown error";
      if (accumulator) {
        const finalView = await accumulator
          .finalize({ stopReason: "cancelled", error: messageText })
          .catch(() => null);
        broadcast(conv.id, "turn.end", { stopReason: "cancelled", message: finalView });
      }
      broadcast(conv.id, "error", { message: messageText });
    } finally {
      cancelPendingRequests(conv.id);
      activeTurns.delete(conv.id);
      finishGeneration(conv.id);
    }
  })();
}

export async function sendMessageStream(
  conv: ConversationRow,
  input: SendMessageInput,
  requestSignal: AbortSignal,
): Promise<Response> {
  if (hasGeneration(conv.id)) {
    throw new HttpError(409, "A response is already streaming for this conversation");
  }
  const trimmed = input.text.trim();
  if (trimmed.length === 0 && (input.attachments?.length ?? 0) === 0) {
    throw new HttpError(400, "Message text or attachment is required");
  }

  startGenerationLog(conv.id);
  runTurn(conv, input);
  // runTurn's prologue is synchronous, so the log registered above is still live.
  return subscribeGeneration(conv.id, requestSignal)!;
}

/**
 * Agents interpret a leading `/name` in a prompt themselves, so a command is
 * just a turn whose text is the command line.
 */
export function sendCommandStream(
  conv: ConversationRow,
  command: { name: string; args?: string },
  requestSignal: AbortSignal,
): Promise<Response> {
  const args = command.args?.trim();
  const text = args ? `/${command.name} ${args}` : `/${command.name}`;
  return sendMessageStream(conv, { text }, requestSignal);
}

export function attachMessageStream(
  conv: ConversationRow,
  requestSignal: AbortSignal,
): Response {
  const response = subscribeGeneration(conv.id, requestSignal);
  return response ?? new Response(null, { status: 204 });
}
