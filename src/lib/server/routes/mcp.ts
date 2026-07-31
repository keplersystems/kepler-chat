import { Elysia, t } from "elysia";
import { MCP_NAME_PATTERN } from "$lib/contracts";
import { requireAuth } from "$lib/server/auth";
import { requireProject } from "$lib/server/projects";
import { listMcpServers, removeMcpServer, upsertMcpServer } from "$lib/server/mcp";

const mcpNameSchema = t.RegExp(MCP_NAME_PATTERN, { description: "MCP server name" });

const mcpConfigSchema = t.Union([
  t.Object({
    type: t.Literal("local"),
    command: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
    environment: t.Optional(t.Record(t.String(), t.String())),
    enabled: t.Optional(t.Boolean()),
  }),
  t.Object({
    type: t.Literal("remote"),
    url: t.String({ minLength: 1 }),
    headers: t.Optional(t.Record(t.String(), t.String())),
    enabled: t.Optional(t.Boolean()),
  }),
]);

export const mcpRoute = new Elysia({ prefix: "/api/mcp" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      if (context.query.projectId) await requireProject(context.query.projectId);
      return { servers: await listMcpServers(context.query.projectId ?? null) };
    },
    {
      query: t.Object({ projectId: t.Optional(t.String()) }),
      detail: {
        summary: "List MCP servers",
        tags: ["MCP"],
        description: "List configured MCP servers (global, plus a project's)",
      },
    },
  )
  .put(
    "/:name",
    async (context) => {
      requireAuth(context);
      if (context.body.projectId) await requireProject(context.body.projectId);
      await upsertMcpServer(context.params.name, context.body.projectId ?? null, context.body.config);
      return { success: true as const };
    },
    {
      params: t.Object({ name: mcpNameSchema }),
      body: t.Object({
        projectId: t.Optional(t.String({ minLength: 1 })),
        config: mcpConfigSchema,
      }),
      detail: {
        summary: "Add or update MCP server",
        tags: ["MCP"],
        description: "Store the server config; it applies at the next session establishment",
      },
    },
  )
  .delete(
    "/:name",
    async (context) => {
      requireAuth(context);
      if (context.query.projectId) await requireProject(context.query.projectId);
      await removeMcpServer(context.params.name, context.query.projectId ?? null);
      return { success: true as const };
    },
    {
      params: t.Object({ name: mcpNameSchema }),
      query: t.Object({ projectId: t.Optional(t.String()) }),
      detail: {
        summary: "Remove MCP server",
        tags: ["MCP"],
        description: "Remove the server from its scope",
      },
    },
  );
