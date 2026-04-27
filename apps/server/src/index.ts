import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { env } from "@kepler-chat/env/server";
import { Elysia } from "elysia";
import { authRoute } from "./routes/auth";
import { conversationsRoute } from "./routes/conversations";
import { messagesRoute } from "./routes/messages";
import { requestsRoute } from "./routes/requests";
import { filesRoute } from "./routes/files";
import { providersRoute } from "./routes/providers";
import { modelsRoute } from "./routes/models";
import { opencodeServer } from "./services/opencode";

await opencodeServer.start();

new Elysia()
  .use(
    swagger({
      documentation: {
        info: {
          title: "Kepler Chat API",
          version: "1.0.0",
          description: "Single-user LLM chat with OpenCode agent backend",
        },
        tags: [
          { name: "Conversations", description: "Manage conversations (OpenCode sessions)" },
          { name: "Messages", description: "Send and receive messages" },
          { name: "Requests", description: "Handle permission and question prompts" },
          { name: "Files", description: "Upload and download conversation files" },
          { name: "Providers", description: "Provider auth and model catalog endpoints" },
          { name: "Models", description: "Conversation model selection endpoints" },
        ],
      },
      exclude: ["/api/auth/*", "/"],
    }),
  )
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
  .use(authRoute)
  .use(conversationsRoute)
  .use(messagesRoute)
  .use(requestsRoute)
  .use(filesRoute)
  .use(providersRoute)
  .use(modelsRoute)
  .get("/", () => "OK")
  .get("/test-sse", async () => {
    const html = await Bun.file(import.meta.dir + "/../test-sse.html").text();
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  })
  .listen(3000);

console.log("Server is running on http://localhost:3000");
console.log("API documentation: http://localhost:3000/swagger");

process.on("SIGINT", async () => {
  console.log("\nGracefully shutting down...");
  await opencodeServer.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nGracefully shutting down...");
  await opencodeServer.stop();
  process.exit(0);
});
