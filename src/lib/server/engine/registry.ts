import type { AgentId } from "$lib/contracts";
import { HttpError } from "$lib/server/http-error";
import type { EngineDriver } from "./types";
import { createClaudeDriver } from "./drivers/claude/driver";
import { createCodexDriver } from "./drivers/codex/driver";

/** Engines whose drivers are not yet implemented reject with 501 at use. */
function stubDriver(id: AgentId, name: string): EngineDriver {
  const unavailable = () =>
    new HttpError(501, `The ${name} engine is not available in this build yet`);
  return {
    id,
    name,
    capabilities: {
      chatMode: false,
      fork: false,
      forkAtMessage: false,
      editMessage: false,
      regenerate: false,
      revertInPlace: false,
      modelCatalog: false,
      mcpStatus: false,
      compact: false,
      commands: false,
    },
    ensureSession: async () => {
      throw unavailable();
    },
    deleteSession: async () => {},
    forkSession: async () => {
      throw unavailable();
    },
    rewindTo: async () => {
      throw unavailable();
    },
    runTurn: async () => {
      throw unavailable();
    },
    agentConfig: async () => null,
    sessionConfigFor: () => null,
    setConfigOption: async () => {
      throw unavailable();
    },
    listCommands: async () => [],
    status: async () => ({
      available: false,
      running: false,
      version: null,
      authHint: null,
    }),
    stop: async () => {},
  };
}

const factories: Record<AgentId, () => EngineDriver> = {
  claude: createClaudeDriver,
  codex: createCodexDriver,
  opencode: () => stubDriver("opencode", "OpenCode"),
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
