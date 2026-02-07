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
  const mergedMessages = $derived.by(() => {
    const result: MessageView[] = [];

    for (const message of messages) {
      const prev = result.at(-1);
      const messageText = message.text.trim();
      const messageReasoning = message.reasoning?.trim() ?? "";

      const canMergeReasoningOnly =
        prev &&
        prev.role === "assistant" &&
        message.role === "assistant" &&
        prev.text.trim().length === 0 &&
        messageText.length === 0 &&
        (prev.reasoning?.trim().length ?? 0) > 0 &&
        messageReasoning.length > 0 &&
        (prev.toolCalls?.length ?? 0) === 0 &&
        (message.toolCalls?.length ?? 0) === 0;

      if (canMergeReasoningOnly) {
        result[result.length - 1] = {
          ...prev,
          reasoning: `${prev.reasoning}\n\n${message.reasoning}`,
          finish: message.finish ?? prev.finish,
        };
        continue;
      }

      result.push(message);
    }

    return result;
  });

  $effect(() => {
    // Auto-scroll to bottom when messages change
    if (scrollViewport && mergedMessages.length > 0) {
      scrollViewport.scrollTop = scrollViewport.scrollHeight;
    }
  });
</script>

<ScrollArea class="flex-1">
  <div bind:this={scrollViewport} class="flex flex-col gap-4 p-4">
    {#each mergedMessages as message (message.id)}
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
