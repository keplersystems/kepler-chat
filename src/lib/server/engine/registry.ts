import type { AgentId } from "$lib/contracts";
import type { EngineDriver } from "./types";
import { createClaudeDriver } from "./drivers/claude/driver";
import { createCodexDriver } from "./drivers/codex/driver";
import { createOpencodeDriver } from "./drivers/opencode/driver";

const factories: Record<AgentId, () => EngineDriver> = {
  claude: createClaudeDriver,
  codex: createCodexDriver,
  opencode: createOpencodeDriver,
};

const instances = new Map<AgentId, EngineDriver>();

export function driverFor(agentId: AgentId): EngineDriver {
  let driver = instances.get(agentId);
  if (!driver) {
    driver = factories[agentId]();
    instances.set(agentId, driver);
  }
  return driver;
}

export async function stopAllEngines(): Promise<void> {
  await Promise.all([...instances.values()].map((driver) => driver.stop().catch(() => {})));
}
