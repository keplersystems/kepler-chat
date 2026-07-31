<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import type { AgentId } from "$lib/contracts";
  import { agentCatalog } from "$lib/state/agents.svelte";
  import BotIcon from "@lucide/svelte/icons/bot";

  interface Props {
    value: AgentId | null;
    onChange: (agentId: AgentId) => void;
    disabled?: boolean;
  }

  const { value, onChange, disabled = false }: Props = $props();

  const agents = $derived(agentCatalog.agents);
  const current = $derived(agents.find((agent) => agent.agentId === value) ?? null);
</script>

<Select.Root
  type="single"
  value={value ?? ""}
  onValueChange={(next) => next && onChange(next as AgentId)}
  disabled={disabled || agents.length === 0}
>
  <Select.Trigger
    class="h-8 gap-1.5 border-0 bg-transparent px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
    aria-label="Agent"
  >
    <BotIcon size={13} class="opacity-70" />
    <span class="max-w-[16ch] truncate">{current?.name ?? "Select agent"}</span>
  </Select.Trigger>
  <Select.Content class="min-w-[14rem]">
    {#each agents as agent (agent.agentId)}
      <Select.Item value={agent.agentId} disabled={!agent.available} class="gap-2">
        <span class="min-w-0 flex-1 truncate">{agent.name}</span>
        {#if !agent.available}
          <span class="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
            not installed
          </span>
        {/if}
      </Select.Item>
    {/each}
    {#if agents.length === 0}
      <p class="px-3 py-6 text-center text-sm text-muted-foreground">No agents configured</p>
    {/if}
  </Select.Content>
</Select.Root>
