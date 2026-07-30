<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import PlusIcon from "@lucide/svelte/icons/plus";

  interface Props {
    error: string | null;
    loading: boolean;
    empty: boolean;
    emptyText: string;
    addLabel: string;
    onAdd: () => void;
    onRetry: () => void;
    children: Snippet;
  }

  const { error, loading, empty, emptyText, addLabel, onAdd, onRetry, children }: Props =
    $props();
</script>

<div class="space-y-3">
  {#if error}
    <div
      class="flex items-center justify-between gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
      role="alert"
    >
      <span>{error}</span>
      <Button variant="outline" size="sm" onclick={onRetry}>Retry</Button>
    </div>
  {/if}

  {#if loading}
    {#if !error}
      <div class="flex justify-center py-10 text-muted-foreground">
        <ThinkingOrb size={20} state="searching" />
      </div>
    {/if}
  {:else}
    {#if empty}
      <div class="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    {:else}
      {@render children()}
    {/if}
    <Button variant="outline" size="sm" class="gap-1.5" onclick={onAdd}>
      <PlusIcon size={16} />
      {addLabel}
    </Button>
  {/if}
</div>
