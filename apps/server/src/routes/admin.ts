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

      const instances = await db.query.opencodeConversationInstance.findMany({
        orderBy: (fields, { desc }) => [desc(fields.last_active_at)],
      });

      return {
        instances: instances.map((instance) => ({
          conversationId: instance.conversation_id,
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
        description: "List all OpenCode conversation instances and lifecycle metadata",
      },
    },
  )
  .delete(
    "/instances/:conversationId",
    async (context): Promise<SuccessResponse | { error: string }> => {
      const requesterId = await requireAuth(context);
      if (!isAdminUser(requesterId)) {
        context.set.status = 403;
        return { error: "Forbidden" };
      }

      const { conversationId } = context.params;
      const instance = await db.query.opencodeConversationInstance.findFirst({
        where: (fields, { eq }) => eq(fields.conversation_id, conversationId),
      });

      if (!instance) {
        context.set.status = 404;
        return { error: "Instance not found" };
      }

      await opencodeManager.teardown(conversationId);
      return { success: true };
    },
    {
      params: t.Object({
        conversationId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Force teardown instance",
        tags: ["Admin"],
        description: "Stops and marks a conversation's OpenCode instance as stopped",
      },
    },
  );
