<script lang="ts">
  import type { MessageView } from '$lib/state/chat.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import { ScrollArea } from '$lib/components/ui/scroll-area';

  interface Props {
    messages: MessageView[];
    isStreaming?: boolean;
    onCopy?: (message: MessageView) => void;
    onRegenerate?: (message: MessageView) => void;
    onDelete?: (message: MessageView) => void;
    onEdit?: (message: MessageView) => void;
    onBranch?: (message: MessageView) => void;
  }

  let { messages, isStreaming = false, onCopy, onRegenerate, onDelete, onEdit, onBranch }: Props =
    $props();

  let viewport: HTMLElement | null = $state(null);
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
    if (!viewport) return;
    // Track streaming content length so deltas trigger scroll, not just message count.
    const signal = mergedMessages.reduce(
      (n, m) => n + m.text.length + (m.reasoning?.length ?? 0),
      0,
    );
    void signal;
    viewport.scrollTop = viewport.scrollHeight;
  });
</script>

<ScrollArea class="flex-1" bind:viewportRef={viewport}>
  <div class="flex flex-col gap-6 px-6 py-6">
    {#each mergedMessages as message (message.id)}
      <MessageBubble {message} {onCopy} {onRegenerate} {onDelete} {onEdit} {onBranch} />
    {/each}
    {#if isStreaming}
      <div class="flex items-center gap-2 pl-10 text-muted-foreground">
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
