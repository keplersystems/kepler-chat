<script lang="ts">
  import { tick } from "svelte";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { focusInput } from "$lib/utils";
  import type { ConversationDTO, ProjectDTO } from "$lib/contracts";
  import { Input } from "$lib/components/ui/input";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import ThemeToggle from "$lib/components/ui/ThemeToggle.svelte";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import ImagesIcon from "@lucide/svelte/icons/images";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SettingsIcon from "@lucide/svelte/icons/settings-2";
  import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";

  interface Props {
    conversations: ConversationDTO[];
    projects: ProjectDTO[];
    currentConversationId?: string | null;
    collapsed?: boolean;
    onToggle?: () => void;
  }

  let { conversations, currentConversationId, collapsed = false, onToggle }: Props = $props();

  const nav = [
    { href: "/chats", label: "Chats", icon: MessageSquareIcon },
    { href: "/projects", label: "Projects", icon: FolderIcon },
    { href: "/media", label: "Media", icon: ImagesIcon },
    { href: "/customize", label: "Customize", icon: SlidersHorizontalIcon },
  ];

  const isNavActive = (href: string) => page.url.pathname.startsWith(href);

  let renamingId = $state("");
  let renameDraft = $state("");

  function startRename(conversation: ConversationDTO) {
    renamingId = conversation.id;
    renameDraft = conversation.title;
  }

  async function commitRename() {
    const id = renamingId;
    const title = renameDraft.trim();
    renamingId = "";
    if (!id || !title || title === conversations.find((c) => c.id === id)?.title) return;
    await api.api.conversations({ id }).patch({ title });
    await invalidateAll();
  }

  let deletingId = $state("");
  let deleteForm: HTMLFormElement | null = $state(null);

  async function handleDelete(conversationId: string) {
    deletingId = conversationId;
    await tick();
    deleteForm?.requestSubmit();
  }
</script>

{#snippet railLink(label: string, href: string, icon: typeof PlusIcon)}
  {@const Icon = icon}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <a
          {...props}
          {href}
          class="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
          aria-label={label}
        >
          <Icon size={16} />
        </a>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="right">{label}</Tooltip.Content>
  </Tooltip.Root>
{/snippet}

<aside
  class="t-smooth-width flex h-full {collapsed ? 'w-14' : 'w-72'} shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
>
  {#if collapsed}
    <div class="flex flex-1 flex-col items-center gap-1 py-3">
      <Tooltip.Root>
        <Tooltip.Trigger
          onclick={onToggle}
          class="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
          aria-label="Expand sidebar"
        >
          <PanelLeftIcon size={16} />
        </Tooltip.Trigger>
        <Tooltip.Content side="right">Expand sidebar</Tooltip.Content>
      </Tooltip.Root>
      {@render railLink("New chat", "/chat", PlusIcon)}
      {#each nav as item (item.href)}
        {@render railLink(item.label, item.href, item.icon)}
      {/each}
    </div>
  {:else}
    <div class="flex h-14 shrink-0 items-center justify-between whitespace-nowrap pl-4 pr-2">
      <a href="/chat" class="font-mono text-[13px] font-semibold uppercase tracking-[0.25em] text-foreground">
        Kepler
      </a>
      <Tooltip.Root>
        <Tooltip.Trigger
          onclick={onToggle}
          class="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-foreground"
          aria-label="Collapse sidebar"
        >
          <PanelLeftIcon size={16} />
        </Tooltip.Trigger>
        <Tooltip.Content side="right">Collapse sidebar</Tooltip.Content>
      </Tooltip.Root>
    </div>

    <nav class="flex flex-col gap-0.5 px-2.5">
      <a
        href="/chat"
        class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary hover:bg-sidebar-accent"
      >
        <span
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <PlusIcon size={14} strokeWidth={2.5} />
        </span>
        New chat
      </a>
      {#each nav as item (item.href)}
        <a
          href={item.href}
          class="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground {isNavActive(item.href)
            ? 'bg-sidebar-accent text-foreground'
            : ''}"
        >
          <span class="flex w-6 justify-center"><item.icon size={16} class="opacity-75" /></span>
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="mt-5 min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
      {#if conversations.length > 0}
        <p class="px-2 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">Recents</p>
      {/if}
      <div class="flex flex-col gap-px">
        {#each conversations as conversation (conversation.id)}
          <div
            class="group relative flex items-center rounded-lg hover:bg-sidebar-accent {currentConversationId === conversation.id
              ? 'bg-sidebar-accent'
              : ''}"
          >
            {#if renamingId === conversation.id}
              <form
                class="min-w-0 flex-1 p-1"
                use:focusInput
                onsubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
              >
                <Input
                  bind:value={renameDraft}
                  class="h-7 px-2 text-sm"
                  aria-label="Rename conversation"
                  onkeydown={(e) => {
                    if (e.key === "Escape") renamingId = "";
                  }}
                  onblur={() => (renamingId = "")}
                />
              </form>
            {:else}
              <a
                href={`/chat/${conversation.id}`}
                class="min-w-0 flex-1 truncate px-2 py-1.5 text-sm {currentConversationId === conversation.id
                  ? 'text-foreground'
                  : 'text-sidebar-foreground'}"
              >
                {conversation.title}
              </a>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  class="mr-1 rounded-md p-1 text-sidebar-foreground opacity-0 hover:bg-sidebar-accent focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover:opacity-100"
                  aria-label={`Open menu for ${conversation.title}`}
                >
                  <MoreHorizontalIcon size={14} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Item onSelect={() => startRename(conversation)}>
                    Rename
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    variant="destructive"
                    onSelect={() => handleDelete(conversation.id)}
                  >
                    Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <form method="POST" action="/chat?/delete" use:enhance bind:this={deleteForm} class="hidden">
      <input type="hidden" name="id" value={deletingId} />
    </form>

    <div class="flex items-center gap-0.5 p-2.5">
      <ThemeToggle />
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <a
              {...props}
              href="/settings/providers"
              class="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
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
            <form method="POST" action="/chat?/logout" use:enhance class="contents">
              <button
                {...props}
                type="submit"
                class="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
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
  {/if}
</aside>
