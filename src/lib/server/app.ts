import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { HttpError } from "./http-error";
import { authRoute } from "./routes/auth";
import { conversationsRoute } from "./routes/conversations";
import { messagesRoute } from "./routes/messages";
import { requestsRoute } from "./routes/requests";
import { filesRoute } from "./routes/files";
import { providersRoute } from "./routes/providers";
import { modelsRoute } from "./routes/models";

export const app = new Elysia()
  .use(
    swagger({
      path: "/api/docs",
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
      exclude: ["/api/auth/*"],
    }),
  )
  .onError(({ error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status;
      return { error: error.message };
    }
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
  .use(modelsRoute);

export type App = typeof app;
