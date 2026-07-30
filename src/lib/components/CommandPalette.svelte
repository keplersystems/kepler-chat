<script lang="ts">
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { ConversationDTO, MessageSearchResult, ProjectDTO } from "$lib/contracts";
  import { Dialog } from "bits-ui";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import ImagesIcon from "@lucide/svelte/icons/images";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Settings2Icon from "@lucide/svelte/icons/settings-2";
  import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";

  interface Props {
    conversations: ConversationDTO[];
    projects: ProjectDTO[];
  }

  const { conversations, projects }: Props = $props();

  interface Entry {
    id: string;
    label: string;
    detail?: string;
    hint: string;
    href: string;
    icon: typeof PlusIcon;
  }

  let open = $state(false);
  let query = $state("");
  let activeIndex = $state(0);
  let messageResults = $state<MessageSearchResult[]>([]);
  let searchTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    const q = query.trim();
    clearTimeout(searchTimer);
    if (!open || q.length < 2) {
      messageResults = [];
      return;
    }
    searchTimer = setTimeout(async () => {
      const { data, error } = await api.api.search.get({ query: { q } });
      if (!error && data) messageResults = data.results;
    }, 200);
    return () => clearTimeout(searchTimer);
  });

  const actions: Entry[] = [
    { id: "new", label: "New chat", hint: "Action", href: "/chat", icon: PlusIcon },
    { id: "chats", label: "Chats", hint: "Page", href: "/chats", icon: MessageSquareIcon },
    { id: "projects", label: "Projects", hint: "Page", href: "/projects", icon: FolderIcon },
    { id: "media", label: "Media", hint: "Page", href: "/media", icon: ImagesIcon },
    { id: "customize", label: "Customize", hint: "Page", href: "/customize", icon: SlidersHorizontalIcon },
    { id: "settings", label: "Settings", hint: "Page", href: "/settings/general", icon: Settings2Icon },
  ];

  const entries = $derived.by<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const all: Entry[] = [
      ...actions,
      ...projects.map((p) => ({
        id: `project:${p.id}`,
        label: p.name,
        hint: "Project",
        href: `/projects/${p.id}`,
        icon: FolderIcon,
      })),
      ...conversations.map((c) => ({
        id: `chat:${c.id}`,
        label: c.title,
        hint: "Chat",
        href: `/chat/${c.id}`,
        icon: MessageSquareIcon,
      })),
    ];
    const matches = (q ? all.filter((e) => e.label.toLowerCase().includes(q)) : all).slice(0, 8);
    const messages = messageResults.slice(0, 6).map((r, i) => ({
      id: `message:${r.conversationId}:${i}`,
      label: r.title,
      detail: r.snippet,
      hint: "Message",
      href: `/chat/${r.conversationId}`,
      icon: SearchIcon,
    }));
    return [...matches, ...messages];
  });

  $effect(() => {
    void entries;
    activeIndex = 0;
  });

  $effect(() => {
    if (!open) query = "";
  });

  function handleWindowKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      open = !open;
    }
  }

  function select(entry: Entry) {
    open = false;
    void goto(entry.href);
  }

  function handleListKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, entries.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = entries[activeIndex];
      if (entry) select(entry);
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="t-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
    <Dialog.Content
      class="t-modal fixed left-1/2 top-[18%] z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none"
    >
      <Dialog.Title class="sr-only">Command palette</Dialog.Title>
      <div class="flex items-center gap-2.5 border-b px-4">
        <SearchIcon size={15} class="shrink-0 text-muted-foreground" />
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:value={query}
          autofocus
          placeholder="Search chats, projects, pages…"
          class="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Command palette search"
          onkeydown={handleListKeydown}
        />
        <kbd class="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">esc</kbd>
      </div>
      <ul class="max-h-80 overflow-y-auto p-1.5">
        {#each entries as entry, index (entry.id)}
          <li>
            <button
              type="button"
              onclick={() => select(entry)}
              onpointermove={() => (activeIndex = index)}
              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm {index === activeIndex
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground'}"
            >
              <entry.icon size={15} class="shrink-0 opacity-70" />
              <span class="min-w-0 flex-1 truncate">
                {entry.label}
                {#if entry.detail}
                  <span class="ml-1.5 text-xs text-muted-foreground/70">{entry.detail}</span>
                {/if}
              </span>
              <span class="shrink-0 text-xs text-muted-foreground/70">{entry.hint}</span>
            </button>
          </li>
        {:else}
          <li class="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
        {/each}
      </ul>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
