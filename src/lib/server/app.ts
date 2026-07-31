import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { HttpError } from "./http-error";
import { conversationsRoute } from "./routes/conversations";
import { projectsRoute } from "./routes/projects";
import { messagesRoute } from "./routes/messages";
import { requestsRoute } from "./routes/requests";
import { filesRoute } from "./routes/files";
import { agentsRoute } from "./routes/agents";
import { configRoute } from "./routes/config";
import { commandsRoute } from "./routes/commands";
import { mcpRoute } from "./routes/mcp";
import { skillsRoute } from "./routes/skills";
import { mediaRoute } from "./routes/media";
import { instructionsRoute } from "./routes/instructions";
import { usageRoute } from "./routes/usage";
import { searchRoute } from "./routes/search";
import { permissionsRoute } from "./routes/permissions";

export const app = new Elysia()
  .use(
    swagger({
      path: "/api/docs",
      documentation: {
        info: {
          title: "Kepler Chat API",
          version: "1.0.0",
          description: "Single-user LLM chat with ACP agent backend",
        },
        tags: [
          { name: "Projects", description: "Group conversations with shared instructions and skills" },
          { name: "Conversations", description: "Manage conversations (ACP sessions)" },
          { name: "Messages", description: "Send and receive messages" },
          { name: "Requests", description: "Handle permission and elicitation prompts" },
          { name: "Files", description: "Upload and download conversation files" },
          { name: "Agents", description: "Agent status, env profiles, and lifecycle" },
          { name: "Config", description: "Session config and mode selection" },
          { name: "Commands", description: "Agent-advertised slash commands" },
          { name: "MCP", description: "MCP server configuration" },
          { name: "Skills", description: "Skill (SKILL.md) management" },
        ],
      },
    }),
  )
  .onError(({ error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status;
      return { error: error.message };
    }
    console.error(error);
    set.status = 500;
    return { error: "message" in error ? error.message : "Internal Server Error" };
  })
  .use(projectsRoute)
  .use(conversationsRoute)
  .use(messagesRoute)
  .use(requestsRoute)
  .use(filesRoute)
  .use(agentsRoute)
  .use(configRoute)
  .use(commandsRoute)
  .use(mcpRoute)
  .use(skillsRoute)
  .use(mediaRoute)
  .use(instructionsRoute)
  .use(usageRoute)
  .use(searchRoute)
  .use(permissionsRoute);

export type App = typeof app;
