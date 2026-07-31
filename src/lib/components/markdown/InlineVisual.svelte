<script lang="ts">
  import CodeBlock from "./CodeBlock.svelte";
  import CodeIcon from "@lucide/svelte/icons/code";
  import PlayIcon from "@lucide/svelte/icons/play";

  let { code }: { code: string } = $props();

  // While the block is still streaming the document is unterminated; rendering
  // it would flicker half-parsed markup, so the preview waits for the close.
  const complete = $derived(/<\/(html|body|svg)>\s*$/i.test(code.trimEnd()));

  let view = $state<"preview" | "code" | null>(null);
  const active = $derived(view ?? (complete ? "preview" : "code"));

  /** Scripts may run but nothing leaves the sandbox: no origin, no network. */
  const CSP =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:;">';

  const srcdoc = $derived.by(() => {
    const trimmed = code.trimStart();
    if (!/^<!doctype|^<html/i.test(trimmed)) {
      return `<!doctype html><html><head>${CSP}</head><body style="margin:0">${trimmed}</body></html>`;
    }
    if (/<head(\s[^>]*)?>/i.test(trimmed)) {
      return trimmed.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${CSP}`);
    }
    return trimmed.replace(/(<html(\s[^>]*)?>)/i, `$1<head>${CSP}</head>`);
  });
</script>

<div class="kepler-codeblock max-w-full overflow-hidden rounded-lg border border-border bg-card">
  <div class="flex items-center gap-1 border-b border-border/60 px-2 py-1">
    <span class="mr-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
      visual
    </span>
    <button
      type="button"
      onclick={() => (view = "preview")}
      disabled={!complete}
      aria-pressed={active === "preview"}
      class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] {active === 'preview'
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:text-foreground'} disabled:opacity-40"
    >
      <PlayIcon size={11} />
      Preview
    </button>
    <button
      type="button"
      onclick={() => (view = "code")}
      aria-pressed={active === "code"}
      class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] {active === 'code'
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:text-foreground'}"
    >
      <CodeIcon size={11} />
      Code
    </button>
  </div>
  {#if active === "preview"}
    <iframe
      {srcdoc}
      sandbox="allow-scripts"
      title="Interactive visual"
      class="h-[380px] w-full bg-background"
    ></iframe>
  {:else}
    <CodeBlock {code} lang="html" />
  {/if}
</div>
