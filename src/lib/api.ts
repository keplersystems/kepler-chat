import { treaty } from "@elysiajs/eden";
import { browser } from "$app/environment";
import type { App } from "$lib/server/app";
import type { FileScope } from "$lib/contracts";

export const api = treaty<App>(browser ? window.location.origin : "http://localhost");

export function serverApi(fetcher: typeof fetch, origin = "http://localhost") {
  return treaty<App>(origin, { fetcher });
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
