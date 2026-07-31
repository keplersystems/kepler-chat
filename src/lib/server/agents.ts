import type { AgentStatusDTO } from "$lib/contracts";
import { AGENT_IDS } from "$lib/contracts";
import { driverFor } from "$lib/server/engine/registry";
import { listAgentEnvKeys } from "$lib/server/engine/core/env-profiles";

export async function listAgentStatuses(): Promise<AgentStatusDTO[]> {
  return Promise.all(
    AGENT_IDS.map(async (agentId) => {
      const driver = driverFor(agentId);
      const status = await driver.status();
      return {
        agentId,
        name: driver.name,
        available: status.available,
        running: status.running,
        version: status.version,
        authHint: status.authHint,
        envKeys: await listAgentEnvKeys(agentId),
        capabilities: driver.capabilities,
      };
    }),
  );
}
