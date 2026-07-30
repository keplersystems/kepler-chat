<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import { highlightToHtml } from "$lib/markdown/highlight";

  let { code, lang }: { code: string; lang: string } = $props();

  let html = $state<string | null>(null);
  let copied = $state(false);
  let resetTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    let stale = false;
    highlightToHtml(code, lang).then((result) => {
      if (!stale) html = result;
    });
    return () => {
      stale = true;
    };
  });

  async function copy() {
    await navigator.clipboard.writeText(code);
    copied = true;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="kepler-codeblock max-w-full overflow-hidden rounded-lg border border-border bg-card">
  <div class="flex items-center justify-between border-b border-border bg-muted/50 py-1 pr-1 pl-3">
    <span class="font-mono text-xs text-muted-foreground">{lang || "text"}</span>
    <button
      type="button"
      onclick={copy}
      aria-label={copied ? "Copied" : "Copy code"}
      class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    >
      {#if copied}
        <Check class="h-3.5 w-3.5" />
        Copied
      {:else}
        <Copy class="h-3.5 w-3.5" />
        Copy
      {/if}
    </button>
  </div>
  <div class="code">
    {#if html}
      {@html html}
    {:else}
      <pre><code>{code}</code></pre>
    {/if}
  </div>
</div>

<style>
  .code :global(pre) {
    margin: 0;
    padding: 0.875rem 1rem;
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    line-height: 1.6;
    tab-size: 2;
  }

  .code :global(code) {
    font-family: inherit;
  }

  .code :global(.shiki),
  .code :global(.shiki span) {
    color: var(--shiki-light);
    background-color: var(--shiki-light-bg);
  }

  :global(.dark) .code :global(.shiki),
  :global(.dark) .code :global(.shiki span) {
    color: var(--shiki-dark);
    background-color: var(--shiki-dark-bg);
  }
</style>
