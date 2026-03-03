import { Elysia, t } from "elysia";
import { db } from "@kepler-chat/db";
import { conversation } from "@kepler-chat/db/schema/opencode";
import { eq } from "drizzle-orm";
import { opencodeManager } from "../services/opencode";
import { requireAuth } from "../middleware/auth";
import { requireConversationOwnership } from "../lib/conversation";

interface ProviderModelCatalog {
  id?: string;
  models?: Record<string, { id?: string }>;
}

function hasProviderModel(
  providers: ProviderModelCatalog[],
  providerId: string,
  modelId: string,
): boolean {
  const provider = providers.find((item) => item.id === providerId);
  if (!provider?.models) {
    return false;
  }

  if (modelId in provider.models) {
    return true;
  }

  return Object.values(provider.models).some((model) => model.id === modelId);
}

export const modelsRoute = new Elysia({ prefix: "/api/conversations" })
  .get(
    "/:id/model",
    async (context) => {
      const userId = await requireAuth(context);
      const { id } = context.params;
      const conv = await requireConversationOwnership(id, userId);

      if (!conv) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

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
      const userId = await requireAuth(context);
      const { id } = context.params;
      const { providerID, modelID } = context.body;
      const conv = await requireConversationOwnership(id, userId);

      if (!conv) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

      const { client } = await opencodeManager.getOrSpawn(userId, id);
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
