<script lang="ts">
  import type { MessageView } from "$lib/contracts";
  import { isAbnormalFinish, messageText } from "$lib/messages";
  import Markdown from "$lib/components/markdown/Markdown.svelte";
  import ToolCallCard from "./parts/ToolCallCard.svelte";
  import ReasoningBlock from "./parts/ReasoningBlock.svelte";
  import FileChip from "./parts/FileChip.svelte";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import ProviderLogo from "$lib/components/ui/ProviderLogo.svelte";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import SigmaIcon from "@lucide/svelte/icons/sigma";

  interface Props {
    message: MessageView;
    /** True while this message is the one currently being generated. */
    streaming?: boolean;
  }

  let { message, streaming = false }: Props = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  const isUser = $derived(message.role === "user");
  const isAssistant = $derived(message.role === "assistant");
  const displayFinish = $derived(
    isAbnormalFinish(message.stopReason) ? message.stopReason : null,
  );
  const totalTokens = $derived(message.tokens?.total);
  const lastPartId = $derived(message.parts.at(-1)?.id);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(messageText(message));
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }
</script>

<div class="group flex flex-col {isUser ? 'items-end' : 'items-stretch'}">
  {#if isUser}
    <div class="flex max-w-[85%] flex-col items-end gap-2 sm:max-w-[70%]">
      {#each message.parts as part (part.id)}
        {#if part.type === "text"}
          <div
            class="w-fit whitespace-pre-wrap break-words rounded-xl bg-secondary px-4 py-2.5 text-[15px]"
          >
            {part.text}
          </div>
        {:else if part.type === "file"}
          <FileChip {part} />
        {/if}
      {/each}
    </div>
  {:else}
    <div class="flex min-w-0 flex-col gap-2.5">
      {#each message.parts as part (part.id)}
        {#if part.type === "text"}
          <Markdown source={part.text} />
        {:else if part.type === "reasoning"}
          {#if part.text.trim().length > 0}
            <ReasoningBlock text={part.text} live={streaming && part.id === lastPartId} />
          {/if}
        {:else if part.type === "tool"}
          <ToolCallCard {part} />
        {:else if part.type === "file"}
          <FileChip {part} />
        {/if}
      {/each}
      {#if message.error}
        <div class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {message.error}
        </div>
      {/if}
      {#if streaming}
        <ThinkingOrb size={20} state="working" class="mt-1 opacity-80" />
      {/if}
    </div>
  {/if}

  <div
    class="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground {isUser
      ? 'flex-row-reverse'
      : ''}"
  >
    {#if isAssistant && (message.modelValue || totalTokens !== undefined)}
      <div class="flex items-center gap-2">
        {#if message.modelValue}
          <span class="inline-flex items-center gap-1.5 font-mono text-[11px] opacity-80">
            <ProviderLogo modelValue={message.modelValue} size={12} />
            {message.modelValue}
          </span>
        {/if}
        {#if totalTokens !== undefined}
          <Tooltip.Root>
            <Tooltip.Trigger
              class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent"
              aria-label="Token usage"
            >
              <SigmaIcon size={11} class="opacity-70" />
              <span class="tabular-nums">{totalTokens}</span>
            </Tooltip.Trigger>
            <Tooltip.Content side="bottom">
              {#if message.tokens}
                <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <span class="opacity-70">Input</span>
                  <span class="text-right tabular-nums">{message.tokens.input}</span>
                  <span class="opacity-70">Output</span>
                  <span class="text-right tabular-nums">{message.tokens.output}</span>
                  {#if message.tokens.thought}
                    <span class="opacity-70">Reasoning</span>
                    <span class="text-right tabular-nums">{message.tokens.thought}</span>
                  {/if}
                  {#if message.tokens.cacheRead}
                    <span class="opacity-70">Cache read</span>
                    <span class="text-right tabular-nums">{message.tokens.cacheRead}</span>
                  {/if}
                  {#if message.tokens.cacheWrite}
                    <span class="opacity-70">Cache write</span>
                    <span class="text-right tabular-nums">{message.tokens.cacheWrite}</span>
                  {/if}
                  <span class="font-medium opacity-90">Total</span>
                  <span class="text-right font-medium tabular-nums">{totalTokens}</span>
                  {#if message.cost}
                    <span class="opacity-70">Cost</span>
                    <span class="text-right tabular-nums">${message.cost.toFixed(4)}</span>
                  {/if}
                </div>
              {/if}
            </Tooltip.Content>
          </Tooltip.Root>
        {/if}
      </div>
    {/if}

    <div
      class="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 focus-within:opacity-100"
    >
      <Tooltip.Root>
        <Tooltip.Trigger
          onclick={copyText}
          class="rounded-md p-1 hover:bg-accent hover:text-accent-foreground"
          aria-label="Copy message"
        >
          <span class="t-icon-swap" data-state={copied ? "b" : "a"}>
            <span class="t-icon" data-icon="a"><CopyIcon size={13} /></span>
            <span class="t-icon" data-icon="b"><CheckIcon size={13} strokeWidth={2.5} /></span>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content>{copied ? "Copied" : "Copy"}</Tooltip.Content>
      </Tooltip.Root>
    </div>

    {#if displayFinish}
      <span
        class="ml-auto rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-destructive"
      >
        {displayFinish}
      </span>
    {/if}
  </div>
</div>
