<script lang="ts">
  import { ScrollArea } from '@ark-ui/svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    class?: string;
    orientation?: 'vertical' | 'horizontal' | 'both';
  }

  let { children, class: className = '', orientation = 'vertical' }: Props = $props();
</script>

<ScrollArea.Root class="relative overflow-hidden {className}">
  <ScrollArea.Viewport class="h-full w-full rounded-[inherit]">
    {@render children()}
  </ScrollArea.Viewport>
  {#if orientation === 'vertical' || orientation === 'both'}
    <ScrollArea.Scrollbar orientation="vertical" class="flex touch-none select-none transition-colors data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent data-[orientation=vertical]:p-px">
      <ScrollArea.Thumb class="relative flex-1 rounded-full bg-border before:absolute before:left-1/2 before:top-1/2 before:h-full before:min-h-[44px] before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']" />
    </ScrollArea.Scrollbar>
  {/if}
  {#if orientation === 'horizontal' || orientation === 'both'}
    <ScrollArea.Scrollbar orientation="horizontal" class="flex touch-none select-none transition-colors data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=horizontal]:p-px">
      <ScrollArea.Thumb class="relative flex-1 rounded-full bg-border before:absolute before:left-1/2 before:top-1/2 before:h-full before:w-full before:min-w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']" />
    </ScrollArea.Scrollbar>
  {/if}
</ScrollArea.Root>
