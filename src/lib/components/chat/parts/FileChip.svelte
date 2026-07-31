<script lang="ts">
  import { fileModality, type PartView } from "$lib/contracts";
  import FileIcon from "@lucide/svelte/icons/file";
  import FileArchiveIcon from "@lucide/svelte/icons/file-archive";
  import FileCodeIcon from "@lucide/svelte/icons/file-code";
  import FileSpreadsheetIcon from "@lucide/svelte/icons/file-spreadsheet";
  import FileTextIcon from "@lucide/svelte/icons/file-text";

  interface Props {
    part: Extract<PartView, { type: "file" }>;
    /** Attachments the user sent read as a small tile; the agent's own files
     * get the wider card, where a download is the point. */
    compact?: boolean;
  }

  const { part, compact = false }: Props = $props();

  /**
   * Nothing upstream says what a file is to a reader, and mime types go vague
   * (`application/octet-stream`) exactly where it would matter, so the label
   * comes off the extension.
   */
  const CODE = { kind: "Code", icon: FileCodeIcon };
  const DATA = { kind: "Data", icon: FileCodeIcon };
  const SHEET = { kind: "Spreadsheet", icon: FileSpreadsheetIcon };
  const DOC = { kind: "Document", icon: FileTextIcon };
  const TEXT = { kind: "Text", icon: FileTextIcon };
  const ARCHIVE = { kind: "Archive", icon: FileArchiveIcon };

  const KINDS: Record<string, { kind: string; icon: typeof FileIcon }> = {
    c: CODE, cpp: CODE, cs: CODE, css: CODE, go: CODE, html: CODE, java: CODE,
    js: CODE, jsx: CODE, php: CODE, py: CODE, rb: CODE, rs: CODE, sh: CODE,
    sql: CODE, svelte: CODE, ts: CODE, tsx: CODE, vue: CODE,
    json: DATA, toml: DATA, xml: DATA, yaml: DATA, yml: DATA,
    csv: SHEET, xls: SHEET, xlsx: SHEET,
    doc: DOC, docx: DOC, pdf: DOC,
    md: TEXT, rtf: TEXT, txt: TEXT,
    "7z": ARCHIVE, gz: ARCHIVE, tar: ARCHIVE, zip: ARCHIVE,
  };

  const modality = $derived(part.mimeType ? fileModality(part.mimeType) : null);
  const extension = $derived(
    part.filename.includes(".") ? (part.filename.split(".").pop() ?? "").toLowerCase() : "",
  );
  const descriptor = $derived(KINDS[extension] ?? { kind: "File", icon: FileIcon });
  const Icon = $derived(descriptor.icon);
</script>

{#if modality === "image"}
  <a href={part.url} target="_blank" rel="noopener noreferrer" class="w-fit">
    <img
      src={part.url}
      alt={part.filename}
      class="max-h-80 max-w-full rounded-lg border border-border/60"
      loading="lazy"
    />
  </a>
{:else if modality === "audio"}
  <figure class="w-full max-w-md">
    <audio src={part.url} controls preload="metadata" class="w-full"></audio>
    <figcaption class="mt-1 truncate text-xs">
      <a href={part.url} download={part.filename} class="text-muted-foreground hover:text-foreground">
        {part.filename}
      </a>
    </figcaption>
  </figure>
{:else if modality === "video"}
  <figure class="w-full max-w-md">
    <!-- No caption track exists for an arbitrary upload. -->
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      src={part.url}
      controls
      preload="metadata"
      class="w-full rounded-lg border border-border/60"
    ></video>
    <figcaption class="mt-1 truncate text-xs">
      <a href={part.url} download={part.filename} class="text-muted-foreground hover:text-foreground">
        {part.filename}
      </a>
    </figcaption>
  </figure>
{:else if compact}
  <a
    href={part.url}
    download={part.filename}
    class="flex h-32 w-40 flex-col rounded-xl border border-border/60 bg-card/60 p-3 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <span class="truncate text-sm text-foreground">{part.filename}</span>
    <span class="mt-0.5 text-xs text-muted-foreground">
      {part.lines === undefined ? descriptor.kind : `${part.lines} lines`}
    </span>
    {#if extension}
      <span
        class="mt-auto w-fit rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] uppercase text-muted-foreground"
      >
        {extension}
      </span>
    {/if}
  </a>
{:else}
  <div
    class="flex w-full max-w-md items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-3"
  >
    <span
      class="grid size-11 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground"
      aria-hidden="true"
    >
      <Icon size={20} />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm text-foreground">{part.filename}</span>
      <span class="block text-xs text-muted-foreground">
        {descriptor.kind}{extension ? ` · ${extension.toUpperCase()}` : ""}
      </span>
    </span>
    <a
      href={part.url}
      download={part.filename}
      class="shrink-0 rounded-lg bg-secondary px-3 py-1.5 text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Download
    </a>
  </div>
{/if}
