import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { auth } from "@kepler-chat/auth";
import { env } from "@kepler-chat/env/server";
import { Elysia } from "elysia";
import { conversationsRoute } from "./routes/conversations";
import { messagesRoute } from "./routes/messages";
import { opencodeManager } from "./services/opencode";

new Elysia()
  .use(
    swagger({
      documentation: {
        info: {
          title: "Kepler Chat API",
          version: "1.0.0",
          description: "Multi-user LLM chat with OpenCode agent backend",
        },
        tags: [
          { name: "Conversations", description: "Manage conversations (OpenCode sessions)" },
          { name: "Messages", description: "Send and receive messages" },
        ],
      },
      exclude: ["/api/auth/*", "/"],
    }),
  )
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
      credentials: true,
    }),
  )
  .onError(({ error, set }) => {
    console.error(error);
    const message = "message" in error ? error.message : "Internal Server Error";
    set.status = message === "Unauthorized" ? 401 : 500;
    return { error: message };
  })
  .all("/api/auth/*", async (context) => {
    const { request, status } = context;
    if (["POST", "GET"].includes(request.method)) {
      return auth.handler(request);
    }
    return status(405);
  })
  .use(conversationsRoute)
  .use(messagesRoute)
  .get("/", () => "OK")
  .listen(3000);

console.log("Server is running on http://localhost:3000");
console.log("API documentation: http://localhost:3000/swagger");

process.on("SIGINT", async () => {
  console.log("\nGracefully shutting down...");
  opencodeManager.stopCleanupTask();
  await opencodeManager.teardownAll();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nGracefully shutting down...");
  opencodeManager.stopCleanupTask();
  await opencodeManager.teardownAll();
  process.exit(0);
});
