import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { requireConversation } from "$lib/server/conversations";
import { driverFor } from "$lib/server/engine/registry";
import { modelInfoForConfig } from "$lib/server/engine/core/catalog";

export const configRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/config",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      const config = await driverFor(conv.agent_id).ensureSession(conv);
      return {
        config,
        modelValue: conv.model_value,
        // Last known context occupancy, so the meter is correct after a reload
        // with no active turn (live values arrive only on the stream).
        usage:
          conv.context_size === null
            ? null
            : { used: conv.context_used ?? 0, size: conv.context_size, cost: conv.total_cost },
        modelInfo: await modelInfoForConfig(conv.agent_id, config),
      };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Get session config",
        tags: ["Config"],
        description:
          "Get the conversation's config options, stored model, last known context usage, and model metadata enrichment",
      },
    },
  )
  .put(
    "/:id/config",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      const config = await driverFor(conv.agent_id).setConfigOption(
        conv,
        context.body.configId,
        context.body.value,
      );
      return { config, modelInfo: await modelInfoForConfig(conv.agent_id, config) };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        configId: t.String({ minLength: 1 }),
        value: t.Union([t.String(), t.Boolean()]),
      }),
      detail: {
        summary: "Set config option",
        tags: ["Config"],
        description: "Set a session config option (model, effort, ...) for the conversation",
      },
    },
  );
