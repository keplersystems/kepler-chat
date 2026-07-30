import { treaty } from "@elysiajs/eden";
import { browser } from "$app/environment";
import type { App } from "$lib/server/app";
import type { FileScope } from "$lib/contracts";

export const api = treaty<App>(browser ? window.location.origin : "http://localhost");

export function serverApi(fetcher: typeof fetch, origin = "http://localhost") {
  return treaty<App>(origin, { fetcher });
}

/** Extract the message from an Elysia error payload (`{ error: string }` or plain string). */
export function apiErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value) return value;
  if (typeof value === "object" && value !== null && "error" in value) {
    const { error } = value as { error: unknown };
    if (typeof error === "string") return error;
  }
  return fallback;
}

export function downloadFileUrl(
  conversationId: string,
  path: string,
  scope: FileScope = "output",
): string {
  const encodedConversationId = encodeURIComponent(conversationId);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `/api/conversations/${encodedConversationId}/files/${encodedPath}?scope=${encodeURIComponent(scope)}`;
}
