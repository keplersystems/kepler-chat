<script lang="ts">
  import { tick } from "svelte";
  import { enhance } from "$app/forms";
  import type { ConversationDTO } from "$lib/contracts";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { ScrollArea } from "$lib/components/ui/scroll-area";

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
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
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
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
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
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Tooltip.Trigger>
        <Tooltip.Content>Collapse sidebar</Tooltip.Content>
      </Tooltip.Root>
    </div>

    <div class="p-3">
      <form method="POST" action="/chat?/create" use:enhance>
        <input type="hidden" name="title" value="New Chat" />
        <Button type="submit" variant="outline" class="w-full justify-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 opacity-60">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span class="flex-1 truncate text-left">{conversation.title}</span>
            </a>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class="rounded-md p-1.5 text-sidebar-foreground opacity-0 transition-opacity hover:bg-sidebar-accent focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover:opacity-100"
                aria-label={`Open menu for ${conversation.title}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
                </svg>
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
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" x2="9" y1="12" y2="12" />
                    </svg>
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
