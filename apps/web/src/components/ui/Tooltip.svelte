<script lang="ts">
  import { Tooltip } from '@ark-ui/svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    content: string;
    children: Snippet;
    side?: 'top' | 'right' | 'bottom' | 'left';
  }

  let { content, children, side = 'top' }: Props = $props();
</script>

<Tooltip.Root positioning={{ placement: side }}>
  <Tooltip.Trigger>
    {#snippet asChild()}
      {@render children()}
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Positioner>
    <Tooltip.Content class="z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2">
      {content}
    </Tooltip.Content>
  </Tooltip.Positioner>
</Tooltip.Root>
