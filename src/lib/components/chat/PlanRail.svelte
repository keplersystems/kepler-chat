<script lang="ts">
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { PlanEntry } from "$lib/contracts";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CircleDashedIcon from "@lucide/svelte/icons/circle-dashed";

  interface Props {
    entries: PlanEntry[];
  }

  const { entries }: Props = $props();

  const done = $derived(entries.filter((entry) => entry.status === "completed").length);
</script>

{#if entries.length > 0}
  <div
    class="border-b bg-card/50 px-4 py-2 md:px-6"
    transition:slide={{ duration: 220, easing: cubicOut }}
  >
    <div class="mx-auto w-full max-w-[52rem]">
      <div class="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Plan
        <span class="tabular-nums">{done}/{entries.length}</span>
      </div>
      <ul class="space-y-0.5">
        {#each entries as entry (entry.content)}
          <li class="flex items-center gap-2 text-xs">
            <span class="shrink-0" aria-hidden="true">
              {#if entry.status === "completed"}
                <CheckIcon size={12} strokeWidth={2.5} class="text-muted-foreground/70" />
              {:else if entry.status === "in_progress"}
                <ThinkingOrb size={20} state="working" />
              {:else}
                <CircleDashedIcon size={12} class="text-muted-foreground/50" />
              {/if}
            </span>
            <span
              class={entry.status === "completed"
                ? "text-muted-foreground/60 line-through"
                : entry.status === "in_progress"
                  ? "text-foreground"
                  : "text-muted-foreground"}
            >
              {entry.content}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
