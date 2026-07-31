import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { requireConversation } from "$lib/server/conversations";
import {
  ensureSession,
  sessionConfigFor,
  setSessionConfigOption,
  setSessionMode,
} from "$lib/server/acp/engine";
import { modelInfoForConfig } from "$lib/server/acp/catalog";

export const configRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/config",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      await ensureSession(conv);
      const config = sessionConfigFor(conv.id);
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
          "Get the conversation's session config options and modes, its stored model and last known context usage, and model metadata enrichment",
      },
    },
  )
  .put(
    "/:id/config",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      const config = await setSessionConfigOption(
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
        description: "Set a session config option (model, sandbox, ...) on the agent session",
      },
    },
  )
  .put(
    "/:id/mode",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      const config = await setSessionMode(conv, context.body.modeId);
      return { config, modelInfo: {} };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ modeId: t.String({ minLength: 1 }) }),
      detail: {
        summary: "Set session mode",
        tags: ["Config"],
        description: "Switch the agent session's mode (permission/sandbox preset)",
      },
    },
  );
