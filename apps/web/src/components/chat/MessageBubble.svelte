<script lang="ts">
  import type { MessageView } from '$lib/state/chat-types';

  interface Props {
    message: MessageView;
  }

  let { message }: Props = $props();

  let isUser = $derived(message.role === 'user');
  let isSystem = $derived(message.role === 'system');
  let displayFinish = $derived(
    message.finish && !['tool-calls', 'unknown'].includes(message.finish)
      ? message.finish
      : null
  );
  let displayReasoning = $derived(message.reasoning?.trim() ?? '');
  let displayToolCalls = $derived(message.toolCalls ?? []);
</script>

<div class="flex {isUser ? 'justify-end' : 'justify-start'}">
  <div class="flex max-w-[80%] gap-3 {isUser ? 'flex-row-reverse' : 'flex-row'}">
    <!-- Avatar -->
    {#if !isUser}
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        {#if isSystem}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v6m4.22-10.22l4.24-4.24M6.34 17.66l-4.24 4.24M23 12h-6m-6 0H1m20.24 4.24l-4.24-4.24M6.34 6.34L2.1 2.1" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
        {/if}
      </div>
    {/if}

    <!-- Message Content -->
    <div class="flex flex-col gap-1 {isUser ? 'items-end' : 'items-start'}">
      <div
        class="rounded-lg px-4 py-2.5 text-sm {isUser
          ? 'bg-primary text-primary-foreground'
          : isSystem
            ? 'bg-muted text-muted-foreground italic'
            : 'bg-card border text-card-foreground'}"
      >
        {#if isSystem}
          <span class="text-xs font-medium uppercase tracking-wide">System</span>
          <p class="mt-1">{message.text}</p>
        {:else}
          {#if !isUser && displayReasoning.length > 0}
            <div class="mb-2 rounded-md border border-border/60 bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <div class="mb-1 font-medium">Reasoning</div>
              <div class="whitespace-pre-wrap">{displayReasoning}</div>
            </div>
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
          <div class="prose prose-sm dark:prose-invert max-w-none">
            {message.text}
          </div>
        {/if}
      </div>
      {#if displayFinish}
        <span class="text-xs text-muted-foreground">{displayFinish}</span>
      {/if}
    </div>
  </div>
</div>
