import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { env } from "@kepler-chat/env/server";

export function getConversationRoot(conversationId: string): string {
  return resolve(env.KEPLER_SESSIONS_PATH, "conversations", conversationId);
}

export function getConversationInputPath(conversationId: string): string {
  return resolve(getConversationRoot(conversationId), "input");
}

export function getConversationOutputPath(conversationId: string): string {
  return resolve(getConversationRoot(conversationId), "output");
}

export async function provisionConversationDirectories(
  conversationId: string,
): Promise<void> {
  await Promise.all([
    mkdir(getConversationInputPath(conversationId), { recursive: true }),
    mkdir(getConversationOutputPath(conversationId), { recursive: true }),
  ]);
}
