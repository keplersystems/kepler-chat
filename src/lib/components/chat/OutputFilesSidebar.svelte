<script lang="ts">
  import type { FileEntryDTO } from "$lib/contracts";
  import FilePanel from "$lib/components/chat/FilePanel.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

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
          <FileTextIcon size={16} />
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
              <RefreshCwIcon size={14} />
            </Tooltip.Trigger>
            <Tooltip.Content>Refresh files</Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              onclick={() => (collapsed = true)}
              class="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Collapse files panel"
            >
              <FileTextIcon size={14} />
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
