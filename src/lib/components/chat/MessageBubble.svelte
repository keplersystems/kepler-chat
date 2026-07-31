<script lang="ts">
  import type { ConversationMode, MessageView, PartView } from "$lib/contracts";
  import { isAbnormalFinish, messageText } from "$lib/messages";
  import Markdown from "$lib/components/markdown/Markdown.svelte";
  import ActivityTrail from "./parts/ActivityTrail.svelte";
  import ToolCallCard from "./parts/ToolCallCard.svelte";
  import ReasoningBlock from "./parts/ReasoningBlock.svelte";
  import FileChip from "./parts/FileChip.svelte";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import ProviderLogo from "$lib/components/ui/ProviderLogo.svelte";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SigmaIcon from "@lucide/svelte/icons/sigma";

  interface Props {
    message: MessageView;
    /** Chat groups tool work into one trail; work keeps the per-call cards. */
    mode?: ConversationMode;
    /** True while this message is the one currently being generated. */
    streaming?: boolean;
    /** Time this turn has been running, blank until it is worth mentioning. */
    elapsedLabel?: string;
    /** Rewind-and-replace; passed only when the engine can truly rewind. */
    onEdit?: (message: MessageView, text: string) => void;
    onRegenerate?: (message: MessageView) => void;
    /** Branch a new conversation anchored at this message. */
    onBranchAt?: (message: MessageView) => void;
  }

  let {
    message,
    mode = "work",
    streaming = false,
    elapsedLabel = "",
    onEdit,
    onRegenerate,
    onBranchAt,
  }: Props = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let editing = $state(false);
  let editDraft = $state("");

  function startEdit() {
    editDraft = messageText(message);
    editing = true;
  }

  function commitEdit() {
    const text = editDraft.trim();
    editing = false;
    if (!text || text === messageText(message)) return;
    onEdit?.(message, text);
  }

  const isUser = $derived(message.role === "user");
  const isAssistant = $derived(message.role === "assistant");
  const displayFinish = $derived(
    isAbnormalFinish(message.stopReason) ? message.stopReason : null,
  );
  const totalTokens = $derived(message.tokens?.total);
  const lastPartId = $derived(message.parts.at(-1)?.id);

  type Block = { trail: false; part: PartView } | { trail: true; id: string; parts: PartView[] };

  /** In chat, a consecutive run of reasoning and tool calls reads as one
   * activity rather than a stack of per-call cards. */
  const blocks = $derived.by<Block[]>(() => {
    const out: Block[] = [];
    for (const part of message.parts) {
      const grouped = mode === "chat" && (part.type === "tool" || part.type === "reasoning");
      const last = out.at(-1);
      if (grouped && last?.trail) last.parts.push(part);
      else if (grouped) out.push({ trail: true, id: part.id, parts: [part] });
      else out.push({ trail: false, part });
    }
    return out;
  });

  /**
   * A live trail or reasoning block already shows its own orb and says what it
   * is doing; a second one below it just competes with the first.
   */
  const blockOwnsIndicator = $derived.by(() => {
    const last = blocks.at(-1);
    if (!streaming || !last) return false;
    if (last.trail) return last.parts.at(-1)?.id === lastPartId;
    return last.part.type === "reasoning" && last.part.id === lastPartId;
  });

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
    {#if editing}
      <div class="w-full max-w-[85%] sm:max-w-[70%]">
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
          bind:value={editDraft}
          autofocus
          rows={Math.min(editDraft.split("\n").length + 1, 10)}
          class="w-full resize-none rounded-xl bg-secondary px-4 py-2.5 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Edit message"
          onkeydown={(e) => {
            if (e.key === "Escape") editing = false;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
            }
          }}
        ></textarea>
        <div class="mt-1.5 flex items-center justify-end gap-2">
          {#each message.parts as part (part.id)}
            {#if part.type === "file"}
              <FileChip {part} compact />
            {/if}
          {/each}
          <Button variant="ghost" size="sm" onclick={() => (editing = false)}>Cancel</Button>
          <Button size="sm" onclick={commitEdit}>Send</Button>
        </div>
      </div>
    {:else}
      <div class="flex max-w-[85%] flex-col items-end gap-2 sm:max-w-[70%]">
        {#each message.parts as part (part.id)}
          {#if part.type === "text"}
            <div
              class="w-fit whitespace-pre-wrap break-words rounded-xl bg-secondary px-4 py-2.5 text-[15px]"
            >
              {part.text}
            </div>
          {:else if part.type === "file"}
            <FileChip {part} compact />
          {/if}
        {/each}
      </div>
    {/if}
  {:else}
    <div class="flex min-w-0 flex-col gap-2.5">
      {#each blocks as block (block.trail ? block.id : block.part.id)}
        {#if block.trail}
          <ActivityTrail
            parts={block.parts}
            live={streaming && block.parts.at(-1)?.id === lastPartId}
          />
        {:else if block.part.type === "text"}
          <Markdown source={block.part.text} />
        {:else if block.part.type === "reasoning"}
          {#if block.part.text.trim().length > 0}
            <ReasoningBlock
              text={block.part.text}
              live={streaming && block.part.id === lastPartId}
            />
          {/if}
        {:else if block.part.type === "tool"}
          <ToolCallCard part={block.part} />
        {:else if block.part.type === "file"}
          <FileChip part={block.part} />
        {/if}
      {/each}
      {#if message.error}
        <div class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {message.error}
        </div>
      {/if}
      {#if streaming && !blockOwnsIndicator}
        <div class="mt-1 flex items-center gap-2">
          <ThinkingOrb size={20} state="composing" class="opacity-80" />
          {#if elapsedLabel}
            <span class="text-xs tabular-nums text-muted-foreground">{elapsedLabel}</span>
          {/if}
        </div>
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
      {#if isUser && onEdit && !editing}
        <Tooltip.Root>
          <Tooltip.Trigger
            onclick={startEdit}
            class="rounded-md p-1 hover:bg-accent hover:text-accent-foreground"
            aria-label="Edit message"
          >
            <PencilIcon size={13} />
          </Tooltip.Trigger>
          <Tooltip.Content>Edit &amp; rerun from here</Tooltip.Content>
        </Tooltip.Root>
      {/if}
      {#if isAssistant && onRegenerate}
        <Tooltip.Root>
          <Tooltip.Trigger
            onclick={() => onRegenerate?.(message)}
            class="rounded-md p-1 hover:bg-accent hover:text-accent-foreground"
            aria-label="Regenerate"
          >
            <RefreshCwIcon size={13} />
          </Tooltip.Trigger>
          <Tooltip.Content>Regenerate</Tooltip.Content>
        </Tooltip.Root>
      {/if}
      {#if isAssistant && onBranchAt && message.engineMessageId}
        <Tooltip.Root>
          <Tooltip.Trigger
            onclick={() => onBranchAt?.(message)}
            class="rounded-md p-1 hover:bg-accent hover:text-accent-foreground"
            aria-label="Branch from here"
          >
            <GitBranchIcon size={13} />
          </Tooltip.Trigger>
          <Tooltip.Content>Branch from here</Tooltip.Content>
        </Tooltip.Root>
      {/if}
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
