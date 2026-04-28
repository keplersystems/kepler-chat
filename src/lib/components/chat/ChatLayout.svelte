<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import ConversationSidebar from './ConversationSidebar.svelte';
  import type { ConversationDTO } from '$lib/contracts';

  interface Props {
    children: Snippet;
    conversations: ConversationDTO[];
    currentConversationId?: string | null;
    user?: { name?: string; email?: string } | null;
  }

  let { children, conversations, currentConversationId, user }: Props = $props();
  let isSidebarCollapsed = $state(false);

  const LEFT_SIDEBAR_STORAGE_KEY = 'kepler:chat:left-sidebar-collapsed';

  onMount(() => {
    const stored = window.localStorage.getItem(LEFT_SIDEBAR_STORAGE_KEY);
    if (stored === 'true') {
      isSidebarCollapsed = true;
    }
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LEFT_SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed));
  });
</script>

<div class="flex h-screen w-full overflow-hidden bg-background">
  <ConversationSidebar
    {conversations}
    {currentConversationId}
    {user}
    collapsed={isSidebarCollapsed}
    onToggle={() => (isSidebarCollapsed = !isSidebarCollapsed)}
  />
  <main class="flex-1 flex flex-col min-w-0">
    {@render children()}
  </main>
</div>
