import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { readPermissionSettings, writePermissionSettings } from "$lib/server/permissions";
import { opencodeServer } from "$lib/server/opencode/supervisor";

const action = t.Union([t.Literal("allow"), t.Literal("ask"), t.Literal("deny")]);

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
        description: "Global tool permission baseline applied to the OpenCode server",
      },
    },
  )
  .put(
    "/",
    async (context) => {
      requireAuth(context);
      await writePermissionSettings(context.body.permissions);
      // Permissions ride on OPENCODE_PERMISSION, which is read at spawn.
      await opencodeServer.restart();
      return { success: true };
    },
    {
      body: t.Object({
        permissions: t.Object({
          bash: action,
          edit: action,
          webfetch: action,
          websearch: action,
          codesearch: action,
          external_directory: action,
        }),
      }),
      detail: {
        summary: "Update tool permissions",
        tags: ["Settings"],
        description: "Persist the permission baseline and restart the OpenCode server",
      },
    },
  );
