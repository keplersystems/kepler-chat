import { Elysia, t } from "elysia";
import { requireAuth } from "$lib/server/auth";
import { requireConversation } from "$lib/server/conversations";
import { setConversationModel } from "$lib/server/messages";

export const modelsRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/model",
    async (context) => {
      requireAuth(context);
      const { id } = context.params;
      const conv = await requireConversation(id);

      if (!conv.provider_id || !conv.model_id) {
        return { model: null };
      }

      return {
        model: {
          providerID: conv.provider_id,
          modelID: conv.model_id,
        },
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Get conversation model",
        tags: ["Models"],
        description: "Get persisted model selection for a conversation",
      },
    },
  )
  .put(
    "/:id/model",
    async (context) => {
      requireAuth(context);
      const { id } = context.params;
      const { providerID, modelID } = context.body;
      const conv = await requireConversation(id);
      await setConversationModel(conv, { providerID, modelID });

      return {
        success: true,
        model: {
          providerID,
          modelID,
        },
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        providerID: t.String({ minLength: 1 }),
        modelID: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Set conversation model",
        tags: ["Models"],
        description: "Persist a conversation-level model selection",
      },
    },
  );
