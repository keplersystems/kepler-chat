<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fade } from 'svelte/transition';
  import { page } from '$app/state';
  import ConversationSidebar from './ConversationSidebar.svelte';
  import type { ConversationDTO, ProjectDTO } from '$lib/contracts';
  import PanelLeftIcon from '@lucide/svelte/icons/panel-left';

  interface Props {
    children: Snippet;
    conversations: ConversationDTO[];
    projects: ProjectDTO[];
    currentConversationId?: string | null;
  }

  let { children, conversations, projects, currentConversationId }: Props = $props();

  const LEFT_SIDEBAR_STORAGE_KEY = 'kepler:chat:left-sidebar-collapsed';

  let isSidebarCollapsed = $state(false);
  let hydrated = $state(false);
  let mobileOpen = $state(false);

  $effect(() => {
    isSidebarCollapsed = window.localStorage.getItem(LEFT_SIDEBAR_STORAGE_KEY) === 'true';
    hydrated = true;
  });

  $effect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LEFT_SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed));
  });

  // Close the mobile drawer on navigation.
  $effect(() => {
    void page.url.pathname;
    mobileOpen = false;
  });
</script>

<div class="flex h-screen w-full overflow-hidden bg-background">
  <button
    type="button"
    class="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-sidebar text-sidebar-foreground shadow-sm md:hidden"
    aria-label="Open navigation"
    onclick={() => (mobileOpen = true)}
  >
    <PanelLeftIcon size={17} />
  </button>

  {#if mobileOpen}
    <button
      type="button"
      class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
      aria-label="Close navigation"
      transition:fade={{ duration: 150 }}
      onclick={() => (mobileOpen = false)}
    ></button>
  {/if}

  <div
    class="max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:transition-transform max-md:duration-[var(--duration-fast)] max-md:ease-[var(--ease-smooth-out)] {mobileOpen
      ? ''
      : 'max-md:-translate-x-full'} md:contents"
  >
    <ConversationSidebar
      {conversations}
      {projects}
      {currentConversationId}
      collapsed={isSidebarCollapsed}
      onToggle={() => (isSidebarCollapsed = !isSidebarCollapsed)}
    />
  </div>

  <main class="flex min-w-0 flex-1 flex-col">
    {@render children()}
  </main>
</div>
