// Pure streaming reducer: applies SSE envelopes from the message stream to an
// in-memory message list. No Svelte or network dependencies.

import type {
  AgentCommand,
  MessageView,
  PendingRequestDTO,
  PlanEntry,
  SessionConfigDTO,
  SessionUsageDTO,
  SSEEnvelope,
} from "$lib/contracts";
import { hasVisibleContent } from "$lib/messages";

export interface MessageStreamEffects {
  onTitle?: (title: string) => void;
  onRequestAsked: (request: PendingRequestDTO) => void;
  onRequestSettled: (requestId: string) => void;
  onPlan: (entries: PlanEntry[]) => void;
  onUsage: (usage: SessionUsageDTO) => void;
  onConfig: (config: SessionConfigDTO) => void;
  onCommands: (commands: AgentCommand[]) => void;
  onError: (message: string) => void;
}

/**
 * `echo` renders the user's submission immediately; it is dropped as soon as
 * the server's persisted user message arrives on the stream.
 */
export function createMessageStream(
  effects: MessageStreamEffects,
  echo: MessageView | null = null,
) {
  const messages = new Map<string, MessageView>();
  const order: string[] = [];
  let echoVisible = echo !== null;

  function apply(env: SSEEnvelope): void {
    switch (env.event) {
      case "message": {
        const incoming = { ...env.data.message, parts: [...env.data.message.parts] };
        if (incoming.role === "user") echoVisible = false;
        const existing = messages.get(incoming.id);
        if (existing) {
          messages.set(incoming.id, { ...existing, ...incoming });
        } else {
          messages.set(incoming.id, incoming);
          order.push(incoming.id);
        }
        break;
      }
      case "part": {
        const msg = messages.get(env.data.messageId);
        if (!msg) break;
        const parts = [...msg.parts];
        const existingIndex = parts.findIndex((part) => part.id === env.data.part.id);
        if (existingIndex >= 0) parts[existingIndex] = env.data.part;
        else if (env.data.index >= parts.length) parts.push(env.data.part);
        else parts[env.data.index] = env.data.part;
        messages.set(msg.id, { ...msg, parts });
        break;
      }
      case "delta": {
        const msg = messages.get(env.data.messageId);
        if (!msg) break;
        const parts = [...msg.parts];
        const index = parts.findIndex((part) => part.id === env.data.partId);
        if (index === -1) break;
        const part = parts[index];
        if (part.type !== "text" && part.type !== "reasoning") break;
        parts[index] = { ...part, text: part.text + env.data.text };
        messages.set(msg.id, { ...msg, parts });
        break;
      }
      case "turn.end": {
        if (env.data.message) {
          const final = env.data.message;
          const existing = messages.get(final.id);
          messages.set(final.id, existing ? { ...existing, ...final } : final);
          if (!existing) order.push(final.id);
        }
        break;
      }
      case "title": {
        effects.onTitle?.(env.data.title);
        break;
      }
      case "plan": {
        effects.onPlan(env.data.entries);
        break;
      }
      case "usage": {
        effects.onUsage(env.data);
        break;
      }
      case "config": {
        effects.onConfig(env.data);
        break;
      }
      case "commands": {
        effects.onCommands(env.data.commands);
        break;
      }
      case "request.asked": {
        effects.onRequestAsked(env.data);
        break;
      }
      case "request.settled": {
        effects.onRequestSettled(env.data.requestId);
        break;
      }
      case "error": {
        effects.onError(env.data.message);
        break;
      }
    }
  }

  function visible(): MessageView[] {
    const list: MessageView[] = echoVisible && echo ? [echo] : [];
    for (const id of order) {
      const msg = messages.get(id)!;
      if (msg.role === "user" || hasVisibleContent(msg)) list.push(msg);
    }
    return list;
  }

  return { apply, visible };
}
