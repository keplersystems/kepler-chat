import { Elysia, t } from "elysia";
import { env } from "$lib/env";
import {
  clearAuthCookie,
  createAuthCookie,
  isAuthenticated,
} from "$lib/server/auth";

export const authRoute = new Elysia({ prefix: "/api/auth" })
  .get("/session", (context) => {
    if (!isAuthenticated(context.request.headers)) {
      context.set.status = 401;
      return { authenticated: false };
    }

    return { authenticated: true };
  })
  .post(
    "/login",
    (context) => {
      const { passcode } = context.body;
      if (passcode !== env.KEPLER_PASSCODE) {
        context.set.status = 401;
        return { error: "Invalid passcode" };
      }

      context.set.headers["Set-Cookie"] = createAuthCookie();
      return { authenticated: true };
    },
    {
      body: t.Object({
        passcode: t.String({ minLength: 4 }),
      }),
    },
  )
  .post("/logout", (context) => {
    context.set.headers["Set-Cookie"] = clearAuthCookie();
    return { success: true };
  });
