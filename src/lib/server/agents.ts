import { spawnSync } from "node:child_process";
import type { InitializeResponse } from "@agentclientprotocol/sdk";
import type { AgentCapabilitiesDTO, AgentId, AgentStatusDTO } from "$lib/contracts";
import { AGENT_IDS } from "$lib/contracts";
import { hostFor } from "$lib/server/acp/engine";
import { AGENTS } from "$lib/server/acp/registry";
import { listAgentEnvKeys } from "$lib/server/acp/env-profiles";

function commandAvailable(argv: string[]): boolean {
  const [bin] = argv;
  if (bin.startsWith("/")) return true;
  const probe = spawnSync("which", [bin], { stdio: "ignore" });
  return probe.status === 0;
}

const AUTH_HINTS: Record<AgentId, string> = {
  opencode: "Sign in with `opencode auth login`",
  claude: "Sign in with `claude` then `/login`",
  codex: "Sign in with `codex login`",
};

function capabilitiesOf(init: InitializeResponse): AgentCapabilitiesDTO {
  const caps = init.agentCapabilities;
  return {
    fork: !!caps?.sessionCapabilities?.fork,
    resume: !!caps?.sessionCapabilities?.resume,
    list: !!caps?.sessionCapabilities?.list,
    images: !!caps?.promptCapabilities?.image,
    mcpHttp: !!caps?.mcpCapabilities?.http,
  };
}

export async function listAgentStatuses(): Promise<AgentStatusDTO[]> {
  return Promise.all(
    AGENT_IDS.map(async (agentId) => {
      const def = AGENTS[agentId];
      const host = hostFor(agentId);
      const init = host.initInfo;

      return {
        agentId,
        name: def.name,
        available: commandAvailable(def.command()),
        running: host.running,
        version: init?.agentInfo?.version ?? null,
        authHint: AUTH_HINTS[agentId],
        envKeys: await listAgentEnvKeys(agentId),
        capabilities: init ? capabilitiesOf(init) : null,
      };
    }),
  );
}
