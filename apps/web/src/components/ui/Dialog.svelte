<script lang="ts">
  import { Dialog } from '@ark-ui/svelte';
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  interface Props {
    title: string;
    description?: string;
    trigger: Snippet;
    children: Snippet;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }

  let {
    title,
    description,
    trigger,
    children,
    open = $bindable(false),
    onOpenChange
  }: Props = $props();

  function handleOpenChange(details: { open: boolean }) {
    open = details.open;
    onOpenChange?.(details.open);
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Trigger>
    {#snippet asChild()}
      {@render trigger()}
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Backdrop class="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
  <Dialog.Positioner class="fixed inset-0 flex items-center justify-center p-4">
    <Dialog.Content class="relative w-full max-w-lg rounded-lg border bg-card p-6 text-card-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]">
      <Dialog.Title class="text-lg font-semibold leading-none tracking-tight">
        {title}
      </Dialog.Title>
      {#if description}
        <Dialog.Description class="mt-2 text-sm text-muted-foreground">
          {description}
        </Dialog.Description>
      {/if}
      <div class="mt-4">
        {@render children()}
      </div>
      <Dialog.CloseTrigger class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
        <span class="sr-only">Close</span>
      </Dialog.CloseTrigger>
    </Dialog.Content>
  </Dialog.Positioner>
</Dialog.Root>
