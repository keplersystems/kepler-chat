import type { Handle } from "@sveltejs/kit";
import { isAuthenticated } from "$lib/server/auth";
import { opencodeServer } from "$lib/server/opencode/supervisor";

declare global {
  // eslint-disable-next-line no-var
  var __KEPLER_OPENCODE_BOOTED__: boolean | undefined;
}

if (!globalThis.__KEPLER_OPENCODE_BOOTED__) {
  globalThis.__KEPLER_OPENCODE_BOOTED__ = true;
  await opencodeServer.start();

  const shutdown = async () => {
    try {
      await opencodeServer.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname !== "/login" && !isAuthenticated(event.request.headers)) {
    if (event.url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, {
      status: 303,
      headers: { Location: "/login" },
    });
  }
  return resolve(event);
};
