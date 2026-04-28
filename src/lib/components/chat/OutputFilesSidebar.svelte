<script lang="ts">
  import type { FileEntryDTO } from "$lib/contracts";
  import FilePanel from "$lib/components/chat/FilePanel.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";

  interface Props {
    conversationId: string;
    files: FileEntryDTO[];
    collapsed: boolean;
    onRefresh: () => void;
  }

  let { conversationId, files, collapsed = $bindable(), onRefresh }: Props = $props();
</script>

<aside class="hidden border-l bg-sidebar lg:flex {collapsed ? 'w-12' : 'w-80'}">
  {#if collapsed}
    <div class="flex h-full w-full flex-col items-center pt-2">
      <Tooltip.Root>
        <Tooltip.Trigger
          onclick={() => (collapsed = false)}
          class="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label="Expand files panel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8l6 6Z" />
            <path d="M14 2v6h6" />
          </svg>
        </Tooltip.Trigger>
        <Tooltip.Content>Expand files panel</Tooltip.Content>
      </Tooltip.Root>
    </div>
  {:else}
    <div class="flex h-full w-full min-w-0 flex-col">
      <div class="flex h-12 items-center justify-between border-b px-3">
        <span class="text-sm font-semibold text-sidebar-foreground">
          Generated Files ({files.length})
        </span>
        <div class="flex items-center gap-1">
          <Tooltip.Root>
            <Tooltip.Trigger
              onclick={onRefresh}
              class="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Refresh files panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
            </Tooltip.Trigger>
            <Tooltip.Content>Refresh files</Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              onclick={() => (collapsed = true)}
              class="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Collapse files panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8l6 6Z" />
                <path d="M14 2v6h6" />
              </svg>
            </Tooltip.Trigger>
            <Tooltip.Content>Collapse files panel</Tooltip.Content>
          </Tooltip.Root>
        </div>
      </div>
      <div class="min-h-0 flex-1">
        <FilePanel {conversationId} {files} />
      </div>
    </div>
  {/if}
</aside>
