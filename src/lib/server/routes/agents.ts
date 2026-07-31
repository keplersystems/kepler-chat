import { Elysia, t } from "elysia";
import { AGENT_IDS, type AgentId } from "$lib/contracts";
import { requireAuth } from "$lib/server/auth";
import { driverFor } from "$lib/server/engine/registry";
import { modelInfoForConfig, providerEnvVars } from "$lib/server/engine/core/catalog";
import { deleteAgentEnvValue, setAgentEnvValue } from "$lib/server/engine/core/env-profiles";
import { listAgentStatuses } from "$lib/server/agents";
import { HttpError } from "$lib/server/http-error";

function requireAgentId(value: string): AgentId {
  if (!(AGENT_IDS as readonly string[]).includes(value)) {
    throw new HttpError(400, "Unknown agent");
  }
  return value as AgentId;
}

export const agentsRoute = new Elysia({ prefix: "/api/agents" })
  .get(
    "/env-vars",
    async (context) => {
      requireAuth(context);
      return { envVars: await providerEnvVars() };
    },
    {
      detail: {
        summary: "List known provider env vars",
        description: "Env var names from the model catalog, used to suggest keys when adding one.",
        tags: ["Agents"],
      },
    },
  )
  .get(
    "/:agentId/config",
    async (context) => {
      requireAuth(context);
      const agentId = requireAgentId(context.params.agentId);
      const config = await driverFor(agentId).agentConfig("work", context.query.model || undefined);
      return { config, modelInfo: await modelInfoForConfig(agentId, config) };
    },
    {
      params: t.Object({ agentId: t.String() }),
      query: t.Object({ model: t.Optional(t.String()) }),
      detail: {
        summary: "Get an agent's session config options",
        description:
          "Options the agent advertises for a new session, so a model can be chosen before the conversation exists.",
        tags: ["Agents"],
      },
    },
  )
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      return { agents: await listAgentStatuses() };
    },
    {
      detail: {
        summary: "List agents",
        tags: ["Agents"],
        description: "Availability, version, auth hint, and env keys for each agent",
      },
    },
  )
  .put(
    "/:agentId/env",
    async (context) => {
      requireAuth(context);
      const agentId = requireAgentId(context.params.agentId);
      await setAgentEnvValue(agentId, context.body.key, context.body.value);
      // Env applies at next spawn.
      await driverFor(agentId).stop();
      return { success: true as const };
    },
    {
      params: t.Object({ agentId: t.String() }),
      body: t.Object({
        key: t.String({ minLength: 1 }),
        value: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Set agent env value",
        tags: ["Agents"],
        description: "Store an encrypted env value for the agent and restart it",
      },
    },
  )
  .delete(
    "/:agentId/env/:key",
    async (context) => {
      requireAuth(context);
      const agentId = requireAgentId(context.params.agentId);
      await deleteAgentEnvValue(agentId, context.params.key);
      await driverFor(agentId).stop();
      return { success: true as const };
    },
    {
      params: t.Object({ agentId: t.String(), key: t.String() }),
      detail: {
        summary: "Delete agent env value",
        tags: ["Agents"],
        description: "Remove a stored env value for the agent and restart it",
      },
    },
  )
  .post(
    "/:agentId/restart",
    async (context) => {
      requireAuth(context);
      const agentId = requireAgentId(context.params.agentId);
      await driverFor(agentId).stop();
      return { success: true as const };
    },
    {
      params: t.Object({ agentId: t.String() }),
      detail: {
        summary: "Restart agent",
        tags: ["Agents"],
        description: "Stop the agent subprocess; it respawns on next use",
      },
    },
  );
