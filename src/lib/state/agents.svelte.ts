import { browser } from "$app/environment";
import { api, request } from "$lib/api";
import type { AgentId, AgentStatusDTO } from "$lib/contracts";

const LAST_AGENT_KEY = "kepler:last-agent";

function createAgentStore() {
  let agents = $state<AgentStatusDTO[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let loaded = false;
  // Plain (non-reactive) latches: reading $state here would make any $effect
  // that calls load() depend on it and re-run itself on every status change.
  let inflight: Promise<void> | null = null;

  function load(force = false): Promise<void> {
    if (loaded && !force) return Promise.resolve();
    inflight ??= (async () => {
      loading = true;
      const result = await request(api.api.agents.get(), "Failed to load agents");
      error = result.error;
      if (result.data) {
        agents = result.data.agents;
        loaded = true;
      }
      loading = false;
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function remember(agentId: AgentId) {
    if (browser) window.localStorage.setItem(LAST_AGENT_KEY, agentId);
  }

  /** Preferred agent for a new conversation: last used if still available. */
  function defaultAgent(): AgentId | null {
    const stored = browser
      ? (window.localStorage.getItem(LAST_AGENT_KEY) as AgentId | null)
      : null;
    if (stored && agents.some((agent) => agent.agentId === stored && agent.available)) {
      return stored;
    }
    return agents.find((agent) => agent.available)?.agentId ?? null;
  }

  async function loadDefault(): Promise<AgentId | null> {
    await load();
    return defaultAgent();
  }

  return {
    get agents() {
      return agents;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    load,
    remember,
    defaultAgent,
    loadDefault,
  };
}

export const agentCatalog = createAgentStore();
