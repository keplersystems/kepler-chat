<script lang="ts">
  import type { MessageView } from '$lib/contracts';
  import MessageBubble from './MessageBubble.svelte';
  import { ThinkingOrb } from '$lib/components/ui/orb';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { fade } from 'svelte/transition';
  import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';

  interface Props {
    messages: MessageView[];
    isStreaming?: boolean;
  }

  let { messages, isStreaming = false }: Props = $props();

  let viewport: HTMLElement | null = $state(null);
  let atBottom = $state(true);

  const lastMessageId = $derived(messages.at(-1)?.id);
  const showThinking = $derived(isStreaming && messages.at(-1)?.role !== "assistant");

  function measureAtBottom() {
    if (!viewport) return;
    atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 32;
  }

  function scrollToBottom() {
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }

  $effect(() => {
    if (!viewport) return;
    // Track the tail of the last message so pure text deltas trigger scroll,
    // not just message count.
    const lastPart = messages.at(-1)?.parts.at(-1);
    void (lastPart && "text" in lastPart ? lastPart.text.length : messages.length);
    if (atBottom) scrollToBottom();
  });
</script>

<div class="relative flex-1 min-h-0">
  <ScrollArea class="h-full" bind:viewportRef={viewport} onViewportScroll={measureAtBottom}>
    <div class="mx-auto flex w-full max-w-[52rem] flex-col gap-7 px-4 py-6 sm:px-6">
      {#if messages.length === 0 && !isStreaming}
        <div class="flex flex-col items-center gap-4 py-24 text-center text-muted-foreground">
          <ThinkingOrb size={64} state="shaping" speed={0.5} />
          <p class="text-sm">Send a message to begin.</p>
        </div>
      {/if}
      {#each messages as message (message.id)}
        <div class={isStreaming ? "t-rise" : ""}>
          <MessageBubble
            {message}
            streaming={isStreaming && message.id === lastMessageId && message.role === "assistant"}
          />
        </div>
      {/each}
      {#if showThinking}
        <div
          class="flex items-center gap-2.5"
          in:fade={{ duration: 150 }}
          out:fade={{ duration: 150 }}
        >
          <ThinkingOrb size={20} state="working" />
          <span class="t-shimmer text-sm" data-text="Thinking…">Thinking…</span>
        </div>
      {/if}
    </div>
  </ScrollArea>

  {#if !atBottom}
    <button
      type="button"
      onclick={scrollToBottom}
      transition:fade={{ duration: 150 }}
      class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-popover p-2 text-muted-foreground shadow-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Jump to latest"
    >
      <ArrowDownIcon size={15} />
    </button>
  {/if}
</div>
