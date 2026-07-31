import { api, request } from "$lib/api";
import type { AgentId, ModelInfo, SessionConfigDTO } from "$lib/contracts";

interface AgentConfig {
  config: SessionConfigDTO | null;
  modelInfo: Record<string, ModelInfo>;
}

/**
 * Config options an agent advertises for a new session, so a model can be
 * chosen before the conversation (and its session) exists. Loading starts the
 * agent, so results are cached per agent for the page's lifetime.
 */
function createAgentConfigStore() {
  let byAgent = $state<Record<string, AgentConfig>>({});
  let loading = $state<AgentId | null>(null);
  let error = $state<string | null>(null);
  // Plain latches: reading $state in the guard would subscribe any calling
  // $effect to it and re-run that effect on every load.
  const loaded = new Set<string>();
  const inflight = new Map<string, Promise<void>>();

  /** Options can depend on the model, so each (agent, model) pair is its own entry. */
  function load(agentId: AgentId, modelValue?: string): Promise<void> {
    const key = `${agentId}:${modelValue ?? ""}`;
    if (loaded.has(key)) return Promise.resolve();
    const existing = inflight.get(key);
    if (existing) return existing;

    const pending = (async () => {
      loading = agentId;
      const result = await request(
        api.api.agents({ agentId }).config.get({ query: modelValue ? { model: modelValue } : {} }),
        "Failed to load agent models",
      );
      error = result.error;
      if (result.data) {
        byAgent = { ...byAgent, [key]: result.data };
        loaded.add(key);
      }
      loading = null;
    })().finally(() => inflight.delete(key));

    inflight.set(key, pending);
    return pending;
  }

  return {
    get error() {
      return error;
    },
    isLoading(agentId: AgentId): boolean {
      return loading === agentId;
    },
    configFor(agentId: AgentId, modelValue?: string): SessionConfigDTO | null {
      return (byAgent[`${agentId}:${modelValue ?? ""}`] ?? byAgent[`${agentId}:`])?.config ?? null;
    },
    modelInfoFor(agentId: AgentId, modelValue?: string): Record<string, ModelInfo> {
      const entry = byAgent[`${agentId}:${modelValue ?? ""}`] ?? byAgent[`${agentId}:`];
      return entry?.modelInfo ?? {};
    },
    load,
  };
}

export const agentConfig = createAgentConfigStore();
