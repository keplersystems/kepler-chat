<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";

  interface Props {
    open: boolean;
    title: string;
    error: string | null;
    deleting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    description: Snippet;
  }

  const { open, title, error, deleting, onCancel, onConfirm, description }: Props = $props();
</script>

<Dialog.Root {open} onOpenChange={(value) => !value && onCancel()}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>
        {@render description()}
      </Dialog.Description>
    </Dialog.Header>
    {#if error}
      <p class="text-sm text-destructive" role="alert">{error}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={onCancel}>Cancel</Button>
      <Button variant="destructive" onclick={onConfirm} disabled={deleting}>
        {deleting ? "Deleting..." : "Delete"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
