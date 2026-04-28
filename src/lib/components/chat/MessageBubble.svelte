<script lang="ts">
  import type { MessageView } from "$lib/state/chat.svelte";
  import { isAbnormalFinish } from "$lib/messages";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import ProviderLogo from "$lib/components/ui/ProviderLogo.svelte";
  import AtomIcon from "@lucide/svelte/icons/atom";
  import BotIcon from "@lucide/svelte/icons/bot";
  import CheckIcon from "@lucide/svelte/icons/check";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import SigmaIcon from "@lucide/svelte/icons/sigma";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  interface Props {
    message: MessageView;
    onCopy?: (message: MessageView) => void;
    onRegenerate?: (message: MessageView) => void;
    onDelete?: (message: MessageView) => void;
    onEdit?: (message: MessageView) => void;
    onBranch?: (message: MessageView) => void;
  }

  let { message, onCopy, onRegenerate, onDelete, onEdit, onBranch }: Props = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let menuOpen = $state(false);

  const isUser = $derived(message.role === "user");
  const isSystem = $derived(message.role === "system");
  const isAssistant = $derived(message.role === "assistant");
  const displayFinish = $derived(isAbnormalFinish(message.finish) ? message.finish : null);
  const displayReasoning = $derived(message.reasoning?.trim() ?? "");
  const displayToolCalls = $derived(message.toolCalls ?? []);
  const totalTokens = $derived(
    message.tokens?.total ??
      (message.tokens
        ? (message.tokens.input ?? 0) + (message.tokens.output ?? 0) || undefined
        : undefined),
  );
  const modelLabel = $derived(message.modelID ?? null);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.text);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
    onCopy?.(message);
  }

  function fireRegenerate() {
    onRegenerate?.(message);
  }
  function fireDelete() {
    onDelete?.(message);
  }
  function fireEdit() {
    onEdit?.(message);
  }
  function fireBranch() {
    onBranch?.(message);
  }
</script>

<div class="group flex gap-2 {isUser ? 'flex-row-reverse' : 'flex-row'}">
  <!-- Avatar -->
  {#if !isUser}
    <div class="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
      {#if isSystem}
        <SettingsIcon size={18} strokeWidth={1.75} />
      {:else}
        <BotIcon size={18} strokeWidth={1.75} />
      {/if}
    </div>
  {/if}

  <!-- Content column -->
  <div class="flex min-w-0 flex-col gap-1.5 {isUser ? 'items-end' : 'items-start'}">
    <div
      class="rounded-2xl px-4 py-3 text-sm {isSystem
        ? 'bg-muted text-muted-foreground italic max-w-[80ch]'
        : isUser
          ? 'bg-card text-card-foreground shadow-sm max-w-[60ch] w-fit break-words'
          : 'bg-card text-card-foreground shadow-sm max-w-[80ch]'}"
    >
      {#if isSystem}
        <span class="text-xs font-medium uppercase tracking-wide">System</span>
        <p class="mt-1">{message.text}</p>
      {:else}
        {#if !isUser && displayReasoning.length > 0}
          <Collapsible.Root>
            <Collapsible.Trigger
              class="group mb-2 flex w-fit items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AtomIcon size={14} class="opacity-70" />
              <span class="font-medium">Reasoning</span>
              <ChevronRightIcon
                size={12}
                class="opacity-60 transition-transform group-data-[state=open]:rotate-90"
              />
            </Collapsible.Trigger>
            <Collapsible.Content
              class="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
            >
              <div class="mb-3 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground/85">
                {displayReasoning}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        {/if}
        {#if !isUser && displayToolCalls.length > 0}
          <div class="mb-2 rounded-md border border-border/60 bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <div class="mb-1 font-medium">Tool Calls</div>
            {#each displayToolCalls as toolCall (toolCall.id)}
              <div class="mb-2 rounded border border-border/50 bg-background/70 p-2 last:mb-0">
                <div class="font-mono text-[11px] font-medium">
                  {toolCall.name} ({toolCall.status})
                </div>
                {#if toolCall.input}
                  <div class="mt-1 text-[11px]">
                    <span class="font-medium">Input:</span>
                    <pre class="mt-1 whitespace-pre-wrap break-words font-mono">{toolCall.input}</pre>
                  </div>
                {/if}
                {#if toolCall.output}
                  <div class="mt-1 text-[11px]">
                    <span class="font-medium">Result:</span>
                    <pre class="mt-1 whitespace-pre-wrap break-words font-mono">{toolCall.output}</pre>
                  </div>
                {/if}
                {#if toolCall.error}
                  <div class="mt-1 text-[11px] text-destructive">
                    <span class="font-medium">Error:</span>
                    <pre class="mt-1 whitespace-pre-wrap break-words font-mono">{toolCall.error}</pre>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        <div class="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{message.text}</div>
      {/if}
    </div>

    {#if !isSystem}
      <!-- Footer: metadata (always visible) + action row (dimmed → bright on hover) -->
      <div class="flex items-center gap-3 px-1 text-xs text-muted-foreground">
        {#if modelLabel || totalTokens !== undefined}
          <div class="flex items-center gap-2">
            {#if modelLabel}
              <span class="inline-flex items-center gap-1.5 font-mono text-[11px] opacity-80">
                {#if message.providerID}
                  <ProviderLogo providerId={message.providerID} size={12} />
                {/if}
                {modelLabel}
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
                  <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    {#if message.tokens?.input !== undefined}
                      <span class="opacity-70">Input</span>
                      <span class="text-right tabular-nums">{message.tokens.input}</span>
                    {/if}
                    {#if message.tokens?.output !== undefined}
                      <span class="opacity-70">Output</span>
                      <span class="text-right tabular-nums">{message.tokens.output}</span>
                    {/if}
                    {#if message.tokens?.reasoning}
                      <span class="opacity-70">Reasoning</span>
                      <span class="text-right tabular-nums">{message.tokens.reasoning}</span>
                    {/if}
                    {#if message.tokens?.cacheRead}
                      <span class="opacity-70">Cache read</span>
                      <span class="text-right tabular-nums">{message.tokens.cacheRead}</span>
                    {/if}
                    {#if message.tokens?.cacheWrite}
                      <span class="opacity-70">Cache write</span>
                      <span class="text-right tabular-nums">{message.tokens.cacheWrite}</span>
                    {/if}
                    <span class="font-medium opacity-90">Total</span>
                    <span class="text-right font-medium tabular-nums">{totalTokens}</span>
                  </div>
                </Tooltip.Content>
              </Tooltip.Root>
            {/if}
          </div>
        {/if}

        <!-- Action row: dimmed default, brightens on row hover -->
        <div
          class="flex items-center gap-0.5 transition-opacity {menuOpen
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}"
        >
          <Tooltip.Root>
            <Tooltip.Trigger
              onclick={fireEdit}
              class="rounded-md p-1 hover:bg-accent hover:text-accent-foreground"
              aria-label="Edit message"
            >
              <PencilIcon size={13} />
            </Tooltip.Trigger>
            <Tooltip.Content>Edit</Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              onclick={copyText}
              class="rounded-md p-1 hover:bg-accent hover:text-accent-foreground"
              aria-label="Copy message"
            >
              {#if copied}
                <CheckIcon size={13} strokeWidth={2.5} />
              {:else}
                <CopyIcon size={13} />
              {/if}
            </Tooltip.Trigger>
            <Tooltip.Content>{copied ? "Copied" : "Copy"}</Tooltip.Content>
          </Tooltip.Root>
          {#if isAssistant}
            <Tooltip.Root>
              <Tooltip.Trigger
                onclick={fireBranch}
                class="rounded-md p-1 hover:bg-accent hover:text-accent-foreground"
                aria-label="Branch from this message"
              >
                <GitBranchIcon size={13} />
              </Tooltip.Trigger>
              <Tooltip.Content>Branch</Tooltip.Content>
            </Tooltip.Root>
          {/if}
          <DropdownMenu.Root bind:open={menuOpen}>
            <DropdownMenu.Trigger
              class="rounded-md p-1 hover:bg-accent hover:text-accent-foreground"
              aria-label="More actions"
            >
              <MoreHorizontalIcon size={13} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align={isUser ? "end" : "start"}>
              <DropdownMenu.Item onSelect={fireEdit}>
                <PencilIcon size={14} class="opacity-70" />
                Edit
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={copyText}>
                <CopyIcon size={14} class="opacity-70" />
                Copy
              </DropdownMenu.Item>
              {#if isAssistant}
                <DropdownMenu.Item onSelect={fireRegenerate}>
                  <RefreshCwIcon size={14} class="opacity-70" />
                  Regenerate
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={fireBranch}>
                  <GitBranchIcon size={14} class="opacity-70" />
                  Branch
                </DropdownMenu.Item>
              {/if}
              <DropdownMenu.Separator />
              <DropdownMenu.Item variant="destructive" onSelect={fireDelete}>
                <Trash2Icon size={14} class="opacity-70" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>

        {#if displayFinish}
          <span class="ml-auto rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {displayFinish}
          </span>
        {/if}
      </div>
    {/if}
  </div>
</div>
