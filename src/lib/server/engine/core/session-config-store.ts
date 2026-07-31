// Per-conversation session-config bookkeeping shared by all drivers: the
// user's chosen option values persist on the conversation row and are
// reapplied whenever a native session is (re-)established.

import { eq } from "drizzle-orm";
import { isModelOption } from "$lib/contracts";
import type { SessionConfigDTO, SessionConfigOption } from "$lib/contracts";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/kepler";
import type { ConversationRow } from "../types";

const configByConversation = new Map<string, SessionConfigDTO>();

export function cachedSessionConfig(conversationId: string): SessionConfigDTO | null {
  return configByConversation.get(conversationId) ?? null;
}

export function setCachedSessionConfig(
  conversationId: string,
  config: SessionConfigDTO,
): SessionConfigDTO {
  configByConversation.set(conversationId, config);
  return config;
}

export function dropCachedSessionConfig(conversationId: string): void {
  configByConversation.delete(conversationId);
}

/** Chosen option values, with the legacy model_value column folded in. */
export function storedOptions(conv: ConversationRow): Record<string, string> {
  const options = conv.config_options
    ? (JSON.parse(conv.config_options) as Record<string, string>)
    : {};
  if (conv.model_value && !options.model) options.model = conv.model_value;
  return options;
}

export async function persistChosenOption(
  conv: ConversationRow,
  configId: string,
  value: string,
): Promise<void> {
  const options = storedOptions(conv);
  options[configId] = value;
  const serialized = JSON.stringify(options);
  const modelValue = configId === "model" ? value : (conv.model_value ?? options.model ?? null);
  await db
    .update(conversation)
    .set({ config_options: serialized, model_value: modelValue })
    .where(eq(conversation.id, conv.id));
  conv.config_options = serialized;
  conv.model_value = modelValue;
}

/**
 * Establishment is deduped per conversation because the config route, the
 * commands route, and the turn runner all reach for it at once on a new chat.
 * Each holds its own row object, so only the winner sees the in-place session
 * write; followers reload the session columns before acting on their copy.
 */
export function createSessionEstablisher(
  establish: (conv: ConversationRow) => Promise<SessionConfigDTO>,
): (conv: ConversationRow) => Promise<SessionConfigDTO> {
  const inflight = new Map<string, Promise<SessionConfigDTO>>();
  return async (conv) => {
    const existing = inflight.get(conv.id);
    if (existing) {
      const config = await existing;
      const [row] = await db
        .select({
          engineSessionId: conversation.engine_session_id,
          forkPending: conversation.fork_pending,
        })
        .from(conversation)
        .where(eq(conversation.id, conv.id));
      if (row) {
        conv.engine_session_id = row.engineSessionId;
        conv.fork_pending = row.forkPending;
      }
      return config;
    }
    const task = establish(conv).finally(() => inflight.delete(conv.id));
    inflight.set(conv.id, task);
    return task;
  };
}

/** Shown for a persisted model the engine has since stopped advertising. */
export const STALE_MODEL = "No longer listed";

/** Engines name effort levels in lowercase; option lists read better capitalised. */
export const optionLabel = (value: string): string => value[0].toUpperCase() + value.slice(1);

/** Overlay stored choices onto a driver's synthesized option list. */
export function applyStoredValues(
  options: SessionConfigOption[],
  stored: Record<string, string>,
): SessionConfigOption[] {
  return options.map((option) => {
    const chosen = stored[option.id] ?? (isModelOption(option) ? stored.model : undefined);
    if (chosen === undefined || option.type !== "select") return option;
    return { ...option, currentValue: chosen };
  });
}
