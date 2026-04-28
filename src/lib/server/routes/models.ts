import { Elysia, t } from "elysia";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/opencode";
import { eq } from "drizzle-orm";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import { requireAuth } from "$lib/server/auth";
import { requireConversation } from "$lib/server/conversations";
import {
  hasProviderModel,
  type ProviderModelCatalog,
} from "$lib/server/provider-models";

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
      await requireConversation(id);

      const { client } = await opencodeServer.conversationClient(id);
      const { data: providers, error } = await client.provider.list();
      if (error || !providers) {
        throw new Error("Failed to fetch provider catalog");
      }

      if (!hasProviderModel(providers.all as ProviderModelCatalog[], providerID, modelID)) {
        context.set.status = 400;
        return { error: "Invalid provider/model selection" };
      }

      await db
        .update(conversation)
        .set({
          provider_id: providerID,
          model_id: modelID,
        })
        .where(eq(conversation.id, id));

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
