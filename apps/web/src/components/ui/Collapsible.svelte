<script lang="ts">
  import { Collapsible } from '@ark-ui/svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    trigger: Snippet<[any]>;
    children: Snippet;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }

  let { trigger, children, open = $bindable(false), onOpenChange }: Props = $props();

  function handleOpenChange(details: { open: boolean }) {
    open = details.open;
    onOpenChange?.(details.open);
  }
</script>

<Collapsible.Root bind:open onOpenChange={handleOpenChange}>
  <Collapsible.Trigger>
    {#snippet asChild(props)}
      {@render trigger(props)}
    {/snippet}
  </Collapsible.Trigger>
  <Collapsible.Content class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
    {@render children()}
  </Collapsible.Content>
</Collapsible.Root>
