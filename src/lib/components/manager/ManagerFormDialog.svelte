<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";

  interface Props {
    open: boolean;
    title: string;
    description: string;
    error: string | null;
    saving: boolean;
    submitLabel: string;
    onsubmit: (event: SubmitEvent) => void;
    contentClass?: string;
    children: Snippet;
  }

  let {
    open = $bindable(),
    title,
    description,
    error,
    saving,
    submitLabel,
    onsubmit,
    contentClass = "max-h-[85vh] overflow-y-auto",
    children,
  }: Props = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class={contentClass}>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{description}</Dialog.Description>
    </Dialog.Header>

    <form class="space-y-4" {onsubmit}>
      {@render children()}

      {#if error}
        <p class="text-sm text-destructive" role="alert">{error}</p>
      {/if}

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : submitLabel}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
