import { Elysia, t } from "elysia";
import { PERMISSION_TOOLS, type PermissionTool } from "$lib/contracts";
import { requireAuth } from "$lib/server/auth";
import { stopAllAgents } from "$lib/server/acp/engine";
import {
  readPermissionSettings,
  writePermissionSettings,
} from "$lib/server/permissions";

const action = t.Union([t.Literal("allow"), t.Literal("ask"), t.Literal("deny")]);

const permissionsSchema = t.Object(
  Object.fromEntries(PERMISSION_TOOLS.map((tool) => [tool, action])) as Record<
    PermissionTool,
    typeof action
  >,
);

export const permissionsRoute = new Elysia({ prefix: "/api/permissions" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      return { permissions: await readPermissionSettings() };
    },
    {
      detail: {
        summary: "Get tool permissions",
        tags: ["Settings"],
        description: "Global tool permission baseline",
      },
    },
  )
  .put(
    "/",
    async (context) => {
      requireAuth(context);
      await writePermissionSettings(context.body.permissions);
      // Permissions ride on OPENCODE_PERMISSION, which is read at spawn.
      await stopAllAgents();
      return { success: true };
    },
    {
      body: t.Object({
        permissions: permissionsSchema,
      }),
      detail: {
        summary: "Update tool permissions",
        tags: ["Settings"],
        description: "Persist the permission baseline and restart the OpenCode agent",
      },
    },
  );
