import { treaty } from "@elysiajs/eden";
import { browser } from "$app/environment";
import type { App } from "$lib/server/app";

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

interface TreatyResponse<T> {
  data: T | null;
  error: { value: unknown } | null;
}

/**
 * Unwrap an Eden call into `data` or a display message. Stores share this so
 * error handling cannot drift between them.
 */
export async function request<T>(
  call: Promise<TreatyResponse<T>>,
  fallback: string,
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  const { data, error } = await call;
  if (error || !data) return { data: null, error: apiErrorMessage(error?.value, fallback) };
  return { data, error: null };
}
