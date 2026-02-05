import { Elysia, t } from "elysia";
import { db } from "@kepler-chat/db";
import type { ListInstancesResponse, SuccessResponse } from "@kepler-chat/contracts";
import { requireAuth } from "../middleware/auth";
import { isAdminUser } from "../lib/admin";
import { opencodeManager } from "../services/opencode";

export const adminRoute = new Elysia({ prefix: "/api/admin" })
  .get(
    "/instances",
    async (context): Promise<ListInstancesResponse | { error: string }> => {
      const userId = await requireAuth(context);
      if (!isAdminUser(userId)) {
        context.set.status = 403;
        return { error: "Forbidden" };
      }

      const instances = await db.query.opencodeInstance.findMany({
        orderBy: (fields, { desc }) => [desc(fields.last_active_at)],
      });

      return {
        instances: instances.map((instance) => ({
          userId: instance.user_id,
          serverUrl: instance.server_url,
          port: instance.port,
          pid: instance.pid,
          status: instance.status,
          spawnedAt: instance.spawned_at.toISOString(),
          lastActiveAt: instance.last_active_at.toISOString(),
          error: instance.error,
        })),
      };
    },
    {
      detail: {
        summary: "List OpenCode instances",
        tags: ["Admin"],
        description: "List all OpenCode instances and lifecycle metadata",
      },
    },
  )
  .delete(
    "/instances/:userId",
    async (context): Promise<SuccessResponse | { error: string }> => {
      const requesterId = await requireAuth(context);
      if (!isAdminUser(requesterId)) {
        context.set.status = 403;
        return { error: "Forbidden" };
      }

      const { userId } = context.params;
      const instance = await db.query.opencodeInstance.findFirst({
        where: (fields, { eq }) => eq(fields.user_id, userId),
      });

      if (!instance) {
        context.set.status = 404;
        return { error: "Instance not found" };
      }

      await opencodeManager.teardown(userId);
      return { success: true };
    },
    {
      params: t.Object({
        userId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Force teardown instance",
        tags: ["Admin"],
        description: "Stops and marks a user's OpenCode instance as stopped",
      },
    },
  );
