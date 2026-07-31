<script lang="ts">
  import { browser } from "$app/environment";
  import CodeBlock from "./CodeBlock.svelte";
  import CodeIcon from "@lucide/svelte/icons/code";
  import XIcon from "@lucide/svelte/icons/x";

  let { code }: { code: string } = $props();

  // A fragment has no terminator to detect, so the preview waits until the
  // block stops growing (streaming appends) or the document closes itself.
  let settled = $state(false);
  $effect(() => {
    void code;
    if (/<\/(html|body|svg)>\s*$/i.test(code.trimEnd())) {
      settled = true;
      return;
    }
    settled = false;
    const timer = setTimeout(() => (settled = true), 400);
    return () => clearTimeout(timer);
  });

  let showCode = $state(false);
  let height = $state(120);
  const frameToken = crypto.randomUUID();

  $effect(() => {
    if (!browser) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { keplerVisual?: string; height?: number };
      if (data?.keplerVisual !== frameToken || typeof data.height !== "number") return;
      height = Math.min(Math.max(Math.ceil(data.height), 60), 820);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  /** Kepler theme values resolved to concrete colors for the sandboxed frame. */
  const THEME_VARS = [
    "background",
    "foreground",
    "card",
    "muted",
    "muted-foreground",
    "border",
    "primary",
    "primary-foreground",
    "secondary",
    "accent",
    "activity",
    "destructive",
    "success",
    "radius",
  ];

  function themeBridge(): string {
    if (!browser) return "";
    const styles = getComputedStyle(document.documentElement);
    const vars = THEME_VARS.map(
      (name) => `--${name}: ${styles.getPropertyValue(`--${name}`).trim()};`,
    ).join("");
    // Aliases matching the claude.ai token names models tend to emit.
    return `:root{${vars}
      --color-background: var(--background);
      --color-background-secondary: var(--muted);
      --color-text-primary: var(--foreground);
      --color-text-secondary: var(--muted-foreground);
      --color-border: var(--border);
      --color-accent: var(--primary);
      --border-radius-sm: calc(var(--radius) - 6px);
      --border-radius-md: var(--radius);
      --border-radius-lg: calc(var(--radius) + 4px);
      color-scheme: ${document.documentElement.classList.contains("dark") ? "dark" : "light"};
    }`;
  }

  /** Scripts may run and load charting libs from known CDNs; no other egress. */
  const CSP =
    "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; img-src data:; font-src data:; connect-src 'none'";

  const srcdoc = $derived.by(() => {
    if (!settled) return "";
    const head = `<meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>
${themeBridge()}
html,body{margin:0;padding:0;background:transparent;color:var(--foreground);
font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.6;}
input[type="range"]{accent-color:var(--primary);}
</style>
<script>
(() => {
  const report = () => parent.postMessage(
    { keplerVisual: ${JSON.stringify(frameToken)}, height: document.documentElement.scrollHeight },
    "*",
  );
  new ResizeObserver(report).observe(document.documentElement);
  addEventListener("load", report);
})();
<\/script>`;
    const trimmed = code.trimStart();
    if (/^<!doctype|^<html/i.test(trimmed)) {
      if (/<head(\s[^>]*)?>/i.test(trimmed)) {
        return trimmed.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${head}`);
      }
      return trimmed.replace(/(<html(\s[^>]*)?>)/i, `$1<head>${head}</head>`);
    }
    return `<!doctype html><html><head>${head}</head><body>${trimmed}</body></html>`;
  });
</script>

<div class="group/visual relative my-1 max-w-full">
  {#if showCode}
    <div class="relative">
      <CodeBlock {code} lang="html" />
      <button
        type="button"
        onclick={() => (showCode = false)}
        aria-label="Back to visual"
        class="absolute right-2 top-2 rounded-md bg-background/80 p-1 text-muted-foreground hover:text-foreground"
      >
        <XIcon size={13} />
      </button>
    </div>
  {:else if settled}
    <iframe
      {srcdoc}
      sandbox="allow-scripts"
      title="Interactive visual"
      style="height: {height}px"
      class="w-full border-0 bg-transparent"
    ></iframe>
    <button
      type="button"
      onclick={() => (showCode = true)}
      aria-label="View source"
      class="absolute right-1 top-1 rounded-md p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/visual:opacity-100"
    >
      <CodeIcon size={13} />
    </button>
  {:else}
    <div
      class="flex h-24 items-center justify-center rounded-lg border border-border/50 bg-muted/30 text-xs text-muted-foreground"
    >
      <span class="t-shimmer" data-text="rendering visual…">rendering visual…</span>
    </div>
  {/if}
</div>
