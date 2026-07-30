import type { Context } from "elysia";
import type { Cookies } from "@sveltejs/kit";
import { env } from "$lib/env";
import { HttpError } from "$lib/server/http-error";
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
    throw new HttpError(401, "Unauthorized");
  }
}

export function setSessionCookie(cookies: Cookies): void {
  cookies.set(COOKIE_NAME, sessionToken(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(COOKIE_NAME, { path: "/" });
}

export function verifyPasscode(passcode: string): boolean {
  const a = Buffer.from(passcode);
  const b = Buffer.from(env.KEPLER_PASSCODE);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
