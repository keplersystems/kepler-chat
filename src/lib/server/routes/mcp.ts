import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { requireProject } from "$lib/server/projects";
import {
  completeMcpAuth,
  listMcpServers,
  removeMcpAuth,
  removeMcpServer,
  startMcpAuth,
  upsertMcpServer,
} from "$lib/server/mcp";
import type { ConfigScope } from "$lib/server/opencode/config-file";

const mcpNameSchema = t.RegExp(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
  description: "MCP server name",
});

const mcpOauthSchema = t.Object({
  clientId: t.Optional(t.String({ minLength: 1 })),
  clientSecret: t.Optional(t.String({ minLength: 1 })),
  scope: t.Optional(t.String({ minLength: 1 })),
});

const mcpConfigSchema = t.Union([
  t.Object({
    type: t.Literal("local"),
    command: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
    environment: t.Optional(t.Record(t.String(), t.String())),
    enabled: t.Optional(t.Boolean()),
    timeout: t.Optional(t.Number({ minimum: 1 })),
  }),
  t.Object({
    type: t.Literal("remote"),
    url: t.String({ minLength: 1 }),
    headers: t.Optional(t.Record(t.String(), t.String())),
    oauth: t.Optional(t.Union([mcpOauthSchema, t.Literal(false)])),
    enabled: t.Optional(t.Boolean()),
    timeout: t.Optional(t.Number({ minimum: 1 })),
  }),
]);

async function resolveScope(projectId: string | undefined): Promise<ConfigScope> {
  if (!projectId) return { kind: "global" };
  await requireProject(projectId);
  return { kind: "project", projectId };
}

export const mcpRoute = new Elysia({ prefix: "/api/mcp" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      if (context.query.projectId) await requireProject(context.query.projectId);
      const servers = await listMcpServers(context.query.projectId);
      return { servers };
    },
    {
      query: t.Object({ projectId: t.Optional(t.String()) }),
      detail: {
        summary: "List MCP servers",
        tags: ["MCP"],
        description: "List configured MCP servers with live status (global, plus a project's)",
      },
    },
  )
  .put(
    "/:name",
    async (context) => {
      requireAuth(context);
      const scope = await resolveScope(context.body.projectId);
      await upsertMcpServer(scope, context.params.name, context.body.config);
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
        description:
          "Write the server into the scope's opencode.json and reload affected OpenCode instances",
      },
    },
  )
  .delete(
    "/:name",
    async (context) => {
      requireAuth(context);
      const scope = await resolveScope(context.query.projectId);
      await removeMcpServer(scope, context.params.name);
      return { success: true as const };
    },
    {
      params: t.Object({ name: mcpNameSchema }),
      query: t.Object({ projectId: t.Optional(t.String()) }),
      detail: {
        summary: "Remove MCP server",
        tags: ["MCP"],
        description: "Remove the server from the scope's opencode.json",
      },
    },
  )
  .post(
    "/:name/auth",
    async (context) => {
      requireAuth(context);
      const scope = await resolveScope(context.body.projectId);
      const origin = new URL(context.request.url).origin;
      return startMcpAuth(scope, context.params.name, origin);
    },
    {
      params: t.Object({ name: mcpNameSchema }),
      body: t.Object({ projectId: t.Optional(t.String({ minLength: 1 })) }),
      detail: {
        summary: "Start MCP OAuth",
        tags: ["MCP"],
        description: "Begin the OAuth flow for a remote MCP server; returns the authorization URL",
      },
    },
  )
  .delete(
    "/:name/auth",
    async (context) => {
      requireAuth(context);
      const scope = await resolveScope(context.query.projectId);
      await removeMcpAuth(scope, context.params.name);
      return { success: true as const };
    },
    {
      params: t.Object({ name: mcpNameSchema }),
      query: t.Object({ projectId: t.Optional(t.String()) }),
      detail: {
        summary: "Disconnect MCP OAuth",
        tags: ["MCP"],
        description: "Remove stored OAuth credentials for a remote MCP server",
      },
    },
  )
  .get(
    "/oauth/callback",
    async (context) => {
      requireAuth(context);
      const { code, state, error: providerError } = context.query;
      if (providerError) {
        return context.redirect(`/customize/connectors?error=${encodeURIComponent(providerError)}`, 302);
      }
      if (!code || !state) {
        return context.redirect("/customize/connectors?error=missing_code", 302);
      }
      try {
        const { name } = await completeMcpAuth(state, code);
        return context.redirect(`/customize/connectors?connected=${encodeURIComponent(name)}`, 302);
      } catch (err) {
        const message = err instanceof Error ? err.message : "oauth_failed";
        return context.redirect(`/customize/connectors?error=${encodeURIComponent(message)}`, 302);
      }
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
      detail: {
        summary: "MCP OAuth callback",
        tags: ["MCP"],
        description: "Redirect target for remote MCP OAuth; completes the flow and returns to settings",
      },
    },
  );
