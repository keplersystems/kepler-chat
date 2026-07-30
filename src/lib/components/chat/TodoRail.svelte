<script lang="ts">
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Todo } from "@opencode-ai/sdk/v2";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CircleDashedIcon from "@lucide/svelte/icons/circle-dashed";
  import XIcon from "@lucide/svelte/icons/x";

  interface Props {
    todos: Todo[];
  }

  const { todos }: Props = $props();

  const done = $derived(todos.filter((t) => t.status === "completed").length);
</script>

{#if todos.length > 0}
  <div
    class="border-b bg-card/50 px-4 py-2 md:px-6"
    transition:slide={{ duration: 220, easing: cubicOut }}
  >
    <div class="mx-auto w-full max-w-[52rem]">
      <div class="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Plan
        <span class="tabular-nums">{done}/{todos.length}</span>
      </div>
      <ul class="space-y-0.5">
        {#each todos as todo (todo.content)}
          <li class="flex items-center gap-2 text-xs">
            <span class="shrink-0" aria-hidden="true">
              {#if todo.status === "completed"}
                <CheckIcon size={12} strokeWidth={2.5} class="text-muted-foreground/70" />
              {:else if todo.status === "in_progress"}
                <ThinkingOrb size={20} state="working" />
              {:else if todo.status === "cancelled"}
                <XIcon size={12} class="text-muted-foreground/50" />
              {:else}
                <CircleDashedIcon size={12} class="text-muted-foreground/50" />
              {/if}
            </span>
            <span
              class={todo.status === "completed" || todo.status === "cancelled"
                ? "text-muted-foreground/60 line-through"
                : todo.status === "in_progress"
                  ? "text-foreground"
                  : "text-muted-foreground"}
            >
              {todo.content}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
