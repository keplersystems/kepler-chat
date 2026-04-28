<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/stores';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  const sections = [
    { id: 'providers', label: 'Providers', href: '/settings/providers' },
  ];

  const currentPath = $derived($page.url.pathname);
</script>

<div class="flex h-screen w-full overflow-hidden bg-background">
  <!-- Settings Sidebar -->
  <aside class="flex w-64 flex-col border-r bg-sidebar">
    <div class="flex h-14 items-center border-b px-4">
      <a href="/chat" class="text-lg font-semibold text-sidebar-foreground hover:text-sidebar-accent-foreground">
        ← Back to Chat
      </a>
    </div>
    
    <nav class="flex-1 p-4">
      <div class="space-y-1">
        {#each sections as section}
          <a
            href={section.href}
            class="flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors {currentPath === section.href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}"
          >
            {section.label}
          </a>
        {/each}
      </div>
    </nav>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-auto">
    <div class="mx-auto max-w-4xl p-8">
      {@render children()}
    </div>
  </main>
</div>
