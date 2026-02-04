import type { Context } from "elysia";
import { auth } from "@kepler-chat/auth";

export interface AuthContext extends Context {
  userId: string;
}

/**
 * Extracts userId from Better-Auth session.
 * Throws 401 if not authenticated.
 */
export async function requireAuth(context: Context): Promise<string> {
  const session = await auth.api.getSession({ headers: context.request.headers });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return session.user.id;
}
