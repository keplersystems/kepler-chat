<script lang="ts">
  import { tick } from "svelte";
  import { enhance } from "$app/forms";
  import type { ConversationDTO } from "$lib/contracts";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  interface Props {
    conversations: ConversationDTO[];
    currentConversationId?: string | null;
    user?: { name?: string; email?: string } | null;
    collapsed?: boolean;
    onToggle?: () => void;
  }

  let { conversations, currentConversationId, user, collapsed = false, onToggle }: Props = $props();

  let deletingId = $state("");
  let deleteForm: HTMLFormElement | null = $state(null);

  async function handleDelete(conversationId: string) {
    deletingId = conversationId;
    await tick();
    deleteForm?.requestSubmit();
  }
</script>

<aside class="flex {collapsed ? 'w-12' : 'w-64'} flex-col border-r bg-sidebar">
  {#if collapsed}
    <div class="flex h-14 items-center justify-center border-b">
      <Tooltip.Root>
        <Tooltip.Trigger
          onclick={onToggle}
          class="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent"
          aria-label="Expand sidebar"
        >
          <ChevronRightIcon size={14} />
        </Tooltip.Trigger>
        <Tooltip.Content>Expand sidebar</Tooltip.Content>
      </Tooltip.Root>
    </div>
    <div class="flex flex-1 flex-col items-center gap-2 py-3">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <form method="POST" action="/chat?/create" use:enhance>
              <input type="hidden" name="title" value="New Chat" />
              <button
                {...props}
                type="submit"
                class="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent"
                aria-label="New chat"
              >
                <PlusIcon size={14} />
              </button>
            </form>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>New chat</Tooltip.Content>
      </Tooltip.Root>
    </div>
  {:else}
    <div class="flex h-14 items-center justify-between border-b px-4">
      <span class="text-lg font-semibold text-sidebar-foreground">Kepler</span>
      <Tooltip.Root>
        <Tooltip.Trigger
          onclick={onToggle}
          class="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Collapse sidebar"
        >
          <ChevronLeftIcon size={14} />
        </Tooltip.Trigger>
        <Tooltip.Content>Collapse sidebar</Tooltip.Content>
      </Tooltip.Root>
    </div>

    <div class="p-3">
      <form method="POST" action="/chat?/create" use:enhance>
        <input type="hidden" name="title" value="New Chat" />
        <Button type="submit" variant="outline" class="w-full justify-start gap-2">
          <PlusIcon size={16} />
          New chat
        </Button>
      </form>
    </div>

    <ScrollArea class="flex-1 px-3">
      <div class="space-y-1 py-2">
        {#each conversations as conversation (conversation.id)}
          <div class="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground {currentConversationId === conversation.id ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}">
            <a
              href={`/chat/${conversation.id}`}
              class="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground"
            >
              <MessageSquareIcon size={16} class="shrink-0 opacity-60" />
              <span class="flex-1 truncate text-left">{conversation.title}</span>
            </a>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class="rounded-md p-1.5 text-sidebar-foreground opacity-0 transition-opacity hover:bg-sidebar-accent focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover:opacity-100"
                aria-label={`Open menu for ${conversation.title}`}
              >
                <MoreHorizontalIcon size={14} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item disabled>Rename</DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  variant="destructive"
                  onSelect={() => handleDelete(conversation.id)}
                >
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>
        {/each}
      </div>
    </ScrollArea>

    <form method="POST" action="/chat?/delete" use:enhance bind:this={deleteForm} class="hidden">
      <input type="hidden" name="id" value={deletingId} />
    </form>

    {#if user}
      <div class="border-t p-3">
        <div class="flex items-center gap-3 rounded-md px-2 py-2">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
            {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "?"}
          </div>
          <div class="flex-1 min-w-0">
            <p class="truncate text-sm font-medium text-sidebar-foreground">{user.name || user.email}</p>
          </div>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <a
                  {...props}
                  href="/settings/providers"
                  class="rounded-md p-1.5 text-sidebar-foreground opacity-60 hover:bg-sidebar-accent hover:opacity-100"
                  aria-label="Settings"
                >
                  <SettingsIcon size={16} />
                </a>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Settings</Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <form method="POST" action="/chat?/logout" use:enhance>
                  <button
                    {...props}
                    type="submit"
                    class="rounded-md p-1.5 text-sidebar-foreground opacity-60 hover:bg-sidebar-accent hover:opacity-100"
                    aria-label="Sign out"
                  >
                    <LogOutIcon size={16} />
                  </button>
                </form>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Sign out</Tooltip.Content>
          </Tooltip.Root>
        </div>
      </div>
    {/if}
  {/if}
</aside>
