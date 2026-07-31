<script lang="ts">
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { api, apiErrorMessage } from "$lib/api";
  import { AGENT_IDS, type AgentStatusDTO } from "$lib/contracts";
  import { Button } from "$lib/components/ui/button";
  import { IconButton } from "$lib/components/ui/icon-button";
  import { Input } from "$lib/components/ui/input";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  interface Props {
    data: { agents: AgentStatusDTO[] };
  }

  const { data }: Props = $props();

  let busy = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  // Keyed eagerly: creating an entry lazily during render would be a state
  // write inside a template expression.
  let envVars = $state<Array<{ name: string; provider: string }>>([]);

  onMount(async () => {
    const { data } = await api.api.agents["env-vars"].get();
    if (data) envVars = data.envVars;
  });

  let envForms = $state<Record<string, { key: string; value: string }>>(
    Object.fromEntries(AGENT_IDS.map((id) => [id, { key: "", value: "" }])),
  );

  /** Split "Run `cmd` in a terminal" into text and code segments. */
  function hintSegments(hint: string): Array<{ code: boolean; text: string }> {
    return hint
      .split("`")
      .map((text, index) => ({ code: index % 2 === 1, text }))
      .filter((segment) => segment.text);
  }

  async function mutate(key: string, run: () => Promise<{ error: unknown }>, fallback: string) {
    busy = key;
    const { error } = await run();
    actionError = error
      ? apiErrorMessage((error as { value?: unknown }).value, fallback)
      : null;
    if (!error) await invalidateAll();
    busy = null;
  }

  async function addEnv(agent: AgentStatusDTO) {
    const form = envForms[agent.agentId];
    const key = form.key.trim();
    if (!key || !form.value) return;
    await mutate(
      `${agent.agentId}:env`,
      () => api.api.agents({ agentId: agent.agentId }).env.put({ key, value: form.value }),
      "Failed to save environment variable",
    );
    if (!actionError) envForms[agent.agentId] = { key: "", value: "" };
  }

  function deleteEnv(agent: AgentStatusDTO, key: string) {
    return mutate(
      `${agent.agentId}:${key}`,
      () => api.api.agents({ agentId: agent.agentId }).env({ key }).delete(),
      "Failed to delete environment variable",
    );
  }

  function restart(agent: AgentStatusDTO) {
    return mutate(
      `${agent.agentId}:restart`,
      () => api.api.agents({ agentId: agent.agentId }).restart.post(),
      "Failed to restart agent",
    );
  }
</script>

<div class="max-w-2xl space-y-6">
  <p class="text-sm text-muted-foreground">Each agent signs in through its own CLI.</p>

  {#if actionError}
    <p class="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
      {actionError}
    </p>
  {/if}

  {#if data.agents.length === 0}
    <div
      class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
    >
      No agents registered.
    </div>

  {:else}
    <div class="space-y-4">
      {#each data.agents as agent (agent.agentId)}
        {@const form = envForms[agent.agentId]}
        <section class="rounded-xl border bg-card p-4" aria-label={agent.name}>
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex min-w-0 flex-1 items-baseline gap-2">
              <h2 class="font-medium text-foreground">{agent.name}</h2>
              {#if agent.version}
                <span class="font-mono text-xs text-muted-foreground">v{agent.version}</span>
              {/if}
            </div>
            <span class="text-xs {agent.available ? 'text-muted-foreground' : 'text-destructive'}">
              {agent.available ? (agent.running ? "Running" : "Ready") : "Not installed"}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === `${agent.agentId}:restart` || !agent.running}
              onclick={() => restart(agent)}
            >
              {busy === `${agent.agentId}:restart` ? "Restarting..." : "Restart"}
            </Button>
          </div>

          {#if agent.authHint}
            <p class="mt-2 select-text text-sm text-muted-foreground">
              {#each hintSegments(agent.authHint) as segment, index (index)}
                {#if segment.code}
                  <code
                    class="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
                  >{segment.text}</code>
                {:else}
                  {segment.text}
                {/if}
              {/each}
            </p>
          {/if}

          <div class="mt-4 border-t border-border pt-3">
            <h3 class="text-xs font-medium text-muted-foreground">Environment variables</h3>
            {#if agent.envKeys.length > 0}
              <ul class="mt-2 space-y-1">
                {#each agent.envKeys as key (key)}
                  <li class="flex items-center justify-between gap-2">
                    <span class="truncate font-mono text-sm text-foreground">{key}</span>
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs text-muted-foreground">••••••</span>
                      <IconButton
                        aria-label="Delete {key}"
                        disabled={busy === `${agent.agentId}:${key}`}
                        onclick={() => deleteEnv(agent, key)}
                      >
                        <Trash2Icon size={14} />
                      </IconButton>
                    </div>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mt-2 text-sm text-muted-foreground">
                None set. Add API keys the agent needs.
              </p>
            {/if}
            <form
              class="mt-3 flex flex-col gap-2 sm:flex-row"
              onsubmit={(event) => {
                event.preventDefault();
                addEnv(agent);
              }}
            >
              <Input
                aria-label="Variable name"
                bind:value={form.key}
                list="provider-env-vars"
                class="font-mono sm:max-w-56"
                placeholder="KEY"
              />
              <Input
                aria-label="Variable value"
                type="password"
                bind:value={form.value}
                class="flex-1 font-mono"
                placeholder="value"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                class="gap-1.5 sm:self-center"
                disabled={busy === `${agent.agentId}:env` || !form.key.trim() || !form.value}
              >
                <PlusIcon size={14} />
                Add
              </Button>
            </form>
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<datalist id="provider-env-vars">
  {#each envVars as envVar (envVar.name)}
    <option value={envVar.name}>{envVar.provider}</option>
  {/each}
</datalist>
