import type { Context } from "elysia";
import { env } from "@kepler-chat/env/server";
import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "kepler_session";

function sessionToken(): string {
  return createHash("sha256")
    .update(`kepler:${env.KEPLER_PASSCODE}`)
    .digest("base64url");
}

function cookieValue(headers: Headers, name: string): string | null {
  const cookie = headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAuthenticated(headers: Headers): boolean {
  const value = cookieValue(headers, COOKIE_NAME);
  return value !== null && constantTimeEqual(value, sessionToken());
}

export function requireAuth(context: Context): void {
  if (!isAuthenticated(context.request.headers)) {
    throw new Error("Unauthorized");
  }
}

export function createAuthCookie(): string {
  const secure = env.NODE_ENV === "production" ? " Secure;" : "";
  return `${COOKIE_NAME}=${sessionToken()}; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=2592000`;
}

export function clearAuthCookie(): string {
  const secure = env.NODE_ENV === "production" ? " Secure;" : "";
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax;${secure} Max-Age=0`;
}
