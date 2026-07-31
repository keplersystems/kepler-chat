<script lang="ts">
  import { fade } from "svelte/transition";
  import type { FileEntryDTO, FileScope } from "$lib/contracts";
  import { downloadFileUrl } from "$lib/contracts";
  import Markdown from "$lib/components/markdown/Markdown.svelte";
  import CodeBlock from "$lib/components/markdown/CodeBlock.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import DownloadIcon from "@lucide/svelte/icons/download";

  const TABS = ["preview", "source"] as const;

  interface Props {
    conversationId: string;
    file: FileEntryDTO;
    scope?: FileScope;
  }

  const { conversationId, file, scope = "output" }: Props = $props();

  const MAX_TEXT_BYTES = 1_000_000;

  const CODE_EXTENSIONS = new Set([
    "js", "ts", "jsx", "tsx", "mjs", "cjs", "json", "css", "scss", "svelte",
    "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "sh", "bash",
    "sql", "yaml", "yml", "toml", "xml", "csv", "txt", "log", "diff", "patch",
  ]);
  const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif"]);

  type Kind = "html" | "markdown" | "image" | "pdf" | "code" | "binary";

  const ext = $derived(file.path.split(".").pop()?.toLowerCase() ?? "");
  const kind = $derived.by((): Kind => {
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "md" || ext === "markdown") return "markdown";
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (CODE_EXTENSIONS.has(ext)) return "code";
    return "binary";
  });
  const needsText = $derived(
    (kind === "html" || kind === "markdown" || kind === "code") && file.size <= MAX_TEXT_BYTES,
  );
  const inlineUrl = $derived(
    `${downloadFileUrl(conversationId, file.path, scope)}&disposition=inline`,
  );
  const hasPreviewTabs = $derived(kind === "html" || kind === "markdown");

  let text = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let view = $state<"preview" | "source">("preview");

  $effect(() => {
    text = null;
    error = null;
    view = "preview";
    if (!needsText) return;

    loading = true;
    let cancelled = false;
    fetch(downloadFileUrl(conversationId, file.path, scope), { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        const body = await response.text();
        if (!cancelled) text = body;
      })
      .catch(() => {
        if (!cancelled) error = "Failed to load file content.";
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="flex h-full min-h-0 flex-col gap-2">
  {#if hasPreviewTabs}
    <div class="flex w-fit gap-0.5 rounded-lg bg-muted p-0.5 text-xs" role="tablist">
      {#each TABS as tab (tab)}
        <button
          type="button"
          role="tab"
          aria-selected={view === tab}
          onclick={() => (view = tab)}
          class="rounded-md px-3 py-1 capitalize {view === tab
            ? 'bg-background text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground'}"
        >
          {tab}
        </button>
      {/each}
    </div>
  {/if}

  <div class="min-h-0 flex-1 overflow-auto" in:fade={{ duration: 180 }}>
    {#if loading}
      <div class="h-40 animate-pulse rounded-lg bg-muted/60"></div>
    {:else if error}
      <div class="text-sm text-destructive">{error}</div>
    {:else if kind === "image"}
      <img src={inlineUrl} alt={file.path} class="max-w-full rounded-lg border border-border/60" />
    {:else if kind === "pdf"}
      <iframe src={inlineUrl} title={file.path} class="h-full min-h-[60vh] w-full rounded-lg border border-border/60"
      ></iframe>
    {:else if kind === "html" && text !== null}
      {#if view === "preview"}
        <!-- Untrusted agent output: no same-origin access, scripts only. -->
        <iframe
          srcdoc={text}
          sandbox="allow-scripts"
          title={file.path}
          class="h-full min-h-[60vh] w-full rounded-lg border border-border/60 bg-white"
        ></iframe>
      {:else}
        <CodeBlock code={text} lang="html" />
      {/if}
    {:else if kind === "markdown" && text !== null}
      {#if view === "preview"}
        <Markdown source={text} />
      {:else}
        <CodeBlock code={text} lang="md" />
      {/if}
    {:else if kind === "code" && text !== null}
      <CodeBlock code={text} lang={ext} />
    {:else}
      <div class="flex flex-col items-start gap-3 py-6 text-sm text-muted-foreground">
        <span>No preview for this file type.</span>
        <a
          href={downloadFileUrl(conversationId, file.path, scope)}
          download
          class={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <DownloadIcon size={14} />
          Download
        </a>
      </div>
    {/if}
  </div>
</div>
