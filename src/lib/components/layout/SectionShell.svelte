<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";

  interface Props {
    title: string;
    sections: Array<{ label: string; href: string }>;
    children: Snippet;
  }

  const { title, sections, children }: Props = $props();
  const currentPath = $derived(page.url.pathname);
</script>

<div class="h-full overflow-y-auto">
  <div class="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
    <h1 class="text-xl font-semibold tracking-tight text-foreground max-md:pl-10">{title}</h1>
    <div class="mt-8 flex flex-col gap-8 md:flex-row md:gap-12">
      {#if sections.length > 1}
        <nav class="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col">
          {#each sections as section (section.href)}
            <a
              href={section.href}
              class="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm {currentPath === section.href
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
            >
              {section.label}
            </a>
          {/each}
        </nav>
      {/if}
      <div class="min-w-0 flex-1">
        {@render children()}
      </div>
    </div>
  </div>
</div>
