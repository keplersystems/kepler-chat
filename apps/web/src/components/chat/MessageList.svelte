<script lang="ts">
  import type { MessageView } from '$lib/state/chat-types';
  import MessageBubble from './MessageBubble.svelte';
  import ScrollArea from '../ui/ScrollArea.svelte';

  interface Props {
    messages: MessageView[];
    isStreaming?: boolean;
  }

  let { messages, isStreaming = false }: Props = $props();

  let scrollViewport: HTMLElement | null = $state(null);

  $effect(() => {
    // Auto-scroll to bottom when messages change
    if (scrollViewport && messages.length > 0) {
      scrollViewport.scrollTop = scrollViewport.scrollHeight;
    }
  });
</script>

<ScrollArea class="flex-1">
  <div bind:this={scrollViewport} class="flex flex-col gap-4 p-4">
    {#each messages as message (message.id)}
      <MessageBubble {message} />
    {/each}
    {#if isStreaming}
      <div class="flex items-center gap-2 text-muted-foreground">
        <div class="flex gap-1">
          <span class="animate-bounce">●</span>
          <span class="animate-bounce" style="animation-delay: 0.1s">●</span>
          <span class="animate-bounce" style="animation-delay: 0.2s">●</span>
        </div>
        <span class="text-sm">Thinking...</span>
      </div>
    {/if}
  </div>
</ScrollArea>
