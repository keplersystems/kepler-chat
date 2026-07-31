<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiErrorMessage } from "$lib/api";
  import type { UsageResponse } from "$lib/contracts";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import ProviderLogo from "$lib/components/ui/ProviderLogo.svelte";

  let data = $state<UsageResponse | null>(null);
  let error = $state<string | null>(null);

  onMount(async () => {
    const { data: response, error: err } = await api.api.usage.get();
    if (err) {
      error = apiErrorMessage(err.value, "Failed to load usage");
      return;
    }
    data = response;
  });

  const maxDayTokens = $derived(Math.max(1, ...(data?.days ?? []).map((d) => d.tokens)));

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  const formatCost = (n: number) => `$${n.toFixed(n >= 1 ? 2 : 4)}`;
</script>

{#if error}
  <p class="text-sm text-destructive" role="alert">{error}</p>
{:else if data === null}
  <div class="flex justify-center py-16">
    <ThinkingOrb size={20} state="searching" />
  </div>
{:else}
  <div class="max-w-2xl space-y-8">
    <div>
      <p class="text-sm text-muted-foreground">Last {data.windowDays} days</p>
      <div class="mt-3 grid grid-cols-3 gap-3">
        {#each [["Cost", formatCost(data.totals.cost)], ["Tokens", formatTokens(data.totals.tokens)], ["Responses", String(data.totals.messages)]] as [label, value] (label)}
          <div class="rounded-xl border bg-card p-4">
            <p class="text-xs text-muted-foreground">{label}</p>
            <p class="mt-1 font-mono text-xl tabular-nums text-foreground">{value}</p>
          </div>
        {/each}
      </div>
    </div>

    {#if data.days.length > 0}
      <div>
        <h2 class="text-sm font-medium text-foreground">Tokens per day</h2>
        <div class="mt-3 flex h-28 items-end gap-1">
          {#each data.days as day (day.day)}
            <div
              class="min-w-1 flex-1 rounded-t-sm bg-primary/70 hover:bg-primary"
              style="height: {Math.max(3, (day.tokens / maxDayTokens) * 100)}%"
              title={`${day.day} · ${formatTokens(day.tokens)} tokens · ${formatCost(day.cost)}`}
            ></div>
          {/each}
        </div>
        <div class="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{data.days[0].day}</span>
          <span>{data.days.at(-1)?.day}</span>
        </div>
      </div>
    {/if}

    <div>
      <h2 class="text-sm font-medium text-foreground">By model</h2>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-xs text-muted-foreground">
              <th class="py-2 pr-4 font-medium">Agent</th>
              <th class="py-2 pr-4 font-medium">Model</th>
              <th class="py-2 pr-4 text-right font-medium">In</th>
              <th class="py-2 pr-4 text-right font-medium">Out</th>
              <th class="py-2 pr-4 text-right font-medium">Reasoning</th>
              <th class="py-2 pr-4 text-right font-medium">Msgs</th>
              <th class="py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border font-mono text-xs tabular-nums">
            {#each data.models as model (`${model.agentId}:${model.modelValue}`)}
              <tr>
                <td class="py-2 pr-4">{model.agentId}</td>
                <td class="max-w-52 py-2 pr-4" title={model.modelValue}>
                  <span class="flex items-center gap-1.5">
                    <ProviderLogo modelValue={model.modelValue} size={14} />
                    <span class="truncate">{model.modelValue}</span>
                  </span>
                </td>
                <td class="py-2 pr-4 text-right">{formatTokens(model.input)}</td>
                <td class="py-2 pr-4 text-right">{formatTokens(model.output)}</td>
                <td class="py-2 pr-4 text-right">{formatTokens(model.reasoning)}</td>
                <td class="py-2 pr-4 text-right">{model.messages}</td>
                <td class="py-2 text-right">{formatCost(model.cost)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if data.topConversations.length > 0}
      <div>
        <h2 class="text-sm font-medium text-foreground">Top conversations</h2>
        <ul class="mt-1 divide-y divide-border">
          {#each data.topConversations as conversation (conversation.id)}
            <li>
              <a
                href={`/chat/${conversation.id}`}
                class="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 hover:bg-accent"
              >
                <span class="min-w-0 truncate text-sm text-foreground">{conversation.title}</span>
                <span class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatTokens(conversation.tokens)} · {formatCost(conversation.cost)}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}
