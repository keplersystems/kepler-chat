// Pure streaming reducer: applies SSE envelopes from the message stream to an
// in-memory message list. No Svelte or network dependencies, so the whole
// streaming path is unit-testable.

import type { Part, Todo } from "@opencode-ai/sdk/v2";
import type {
  PendingRequestDTO,
  SendMessageInput,
  SSEEnvelope,
  ServerEventName,
} from "$lib/contracts";
import {
  applyMessageInfo,
  hasVisibleContent,
  isRealSessionTitle,
  toPartView,
  type MessageView,
  type PartView,
} from "$lib/messages";

export type StreamEvent = Extract<SSEEnvelope, { event: ServerEventName }>;

interface StreamingMessage extends MessageView {
  /** part id -> index into parts, for O(1) streaming upserts */
  partIndex: Map<string, number>;
}

function emptyMessage(id: string, role: MessageView["role"]): StreamingMessage {
  return { id, role, parts: [], partIndex: new Map() };
}

function toMessageView(msg: StreamingMessage): MessageView {
  const { partIndex: _, ...view } = msg;
  return { ...view, parts: [...msg.parts] };
}

function upsertPart(msg: StreamingMessage, part: Part): void {
  const view = toPartView(part);
  if (!view) return;
  const idx = msg.partIndex.get(part.id);
  if (idx === undefined) {
    msg.partIndex.set(part.id, msg.parts.length);
    msg.parts.push(view);
  } else {
    msg.parts[idx] = view;
  }
}

function appendPart(msg: StreamingMessage, view: PartView): void {
  msg.partIndex.set(view.id, msg.parts.length);
  msg.parts.push(view);
}

function removePart(msg: StreamingMessage, partId: string): void {
  const idx = msg.partIndex.get(partId);
  if (idx === undefined) return;
  msg.parts.splice(idx, 1);
  msg.partIndex.delete(partId);
  for (const [id, i] of msg.partIndex) {
    if (i > idx) msg.partIndex.set(id, i - 1);
  }
}

function extractSessionErrorMessage(
  error: Extract<StreamEvent, { event: "session.error" }>["data"]["error"],
): string {
  if (!error) return "Session error";
  const message = (error.data as { message?: unknown }).message;
  return typeof message === "string" ? message : error.name;
}

export interface MessageStreamEffects {
  onTitle?: (title: string) => void;
  onRequestAsked: (request: PendingRequestDTO) => void;
  onRequestSettled: (requestId: string) => void;
  onTodos: (todos: Todo[]) => void;
  onSessionError: (message: string) => void;
}

/**
 * `input` is the submission to echo locally while the reply streams; null
 * when reattaching to an in-flight generation whose messages are already
 * persisted.
 */
export function createMessageStream(
  input: SendMessageInput | null,
  fileUrl: (path: string) => string,
  effects: MessageStreamEffects,
) {
  const messages = new Map<string, StreamingMessage>();
  let lastTitle: string | null = null;

  const userEcho = input ? emptyMessage(crypto.randomUUID(), "user") : null;
  if (input && userEcho) {
    if (input.text.trim().length > 0) {
      appendPart(userEcho, { type: "text", id: "echo-text", text: input.text });
    }
    for (const [i, attachment] of (input.attachments ?? []).entries()) {
      appendPart(userEcho, {
        type: "file",
        id: `echo-file-${i}`,
        mime: attachment.mimeType ?? "application/octet-stream",
        filename: attachment.filename ?? attachment.path,
        url: fileUrl(attachment.path),
      });
    }
  }

  const setTitle = (title: string | undefined) => {
    if (title && title !== lastTitle) {
      lastTitle = title;
      effects.onTitle?.(title);
    }
  };

  const ensureMessage = (id: string, role: MessageView["role"]): StreamingMessage => {
    const existing = messages.get(id);
    if (existing) return existing;
    const created = emptyMessage(id, role);
    messages.set(id, created);
    return created;
  };

  function apply(env: StreamEvent): void {
    switch (env.event) {
      case "message.updated": {
        const info = env.data.info;
        if (info.role === "user") {
          // Adopt the server's id so pages can dedup the echo against
          // persisted messages once loads re-run mid-stream.
          if (userEcho) userEcho.id = info.id;
          setTitle(info.summary?.title?.trim());
        }
        const msg = ensureMessage(info.id, info.role);
        applyMessageInfo(msg, info);
        break;
      }
      case "message.removed": {
        messages.delete(env.data.messageID);
        break;
      }
      case "session.updated": {
        const title = env.data.info.title?.trim();
        if (isRealSessionTitle(title)) setTitle(title);
        break;
      }
      case "session.error": {
        effects.onSessionError(extractSessionErrorMessage(env.data.error));
        break;
      }
      case "message.part.updated": {
        const part = env.data.part;
        // Parts can arrive before their message.updated; role is corrected
        // by the message event, and user-role messages are never emitted.
        const msg = ensureMessage(part.messageID, "assistant");
        upsertPart(msg, part);
        break;
      }
      case "message.part.delta": {
        const { messageID, partID, field, delta } = env.data;
        if (field !== "text") break;
        const msg = messages.get(messageID);
        if (!msg) break;
        const idx = msg.partIndex.get(partID);
        if (idx === undefined) break;
        const part = msg.parts[idx];
        if (part.type !== "text" && part.type !== "reasoning") break;
        msg.parts[idx] = { ...part, text: part.text + delta };
        break;
      }
      case "message.part.removed": {
        const msg = messages.get(env.data.messageID);
        if (msg) removePart(msg, env.data.partID);
        break;
      }
      case "permission.asked": {
        effects.onRequestAsked({ type: "permission", request: env.data });
        break;
      }
      case "question.asked": {
        effects.onRequestAsked({ type: "question", request: env.data });
        break;
      }
      case "permission.replied":
      case "question.replied":
      case "question.rejected": {
        effects.onRequestSettled(env.data.requestID);
        break;
      }
      case "todo.updated": {
        effects.onTodos(env.data.todos);
        break;
      }
      case "command.executed": {
        const msg = messages.get(env.data.messageID);
        if (!msg) break;
        appendPart(msg, {
          type: "command",
          id: `cmd:${env.data.name}:${env.data.arguments}`,
          name: env.data.name,
          args: env.data.arguments,
        });
        break;
      }
    }
  }

  /** Current renderable message list: local user echo plus visible assistant messages. */
  function visible(): MessageView[] {
    const list: MessageView[] = userEcho ? [toMessageView(userEcho)] : [];
    for (const msg of messages.values()) {
      // Server-side user messages are tracked for metadata (title) but not echoed —
      // the local userEcho already represents the user's submission until invalidateAll().
      if (msg.role === "user") continue;
      if (hasVisibleContent(msg)) list.push(toMessageView(msg));
    }
    return list;
  }

  return { apply, visible };
}
