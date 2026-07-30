<script lang="ts">
  import type { PartView } from "$lib/messages";
  import FileIcon from "@lucide/svelte/icons/file";

  interface Props {
    part: Extract<PartView, { type: "file" }>;
  }

  const { part }: Props = $props();
</script>

{#if part.mime.startsWith("image/")}
  <img
    src={part.url}
    alt={part.filename ?? "attachment"}
    class="max-h-80 max-w-full rounded-lg border border-border/60"
    loading="lazy"
  />
{:else}
  <a
    href={part.url}
    download={part.filename}
    class="inline-flex w-fit items-center gap-2 rounded-md border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  >
    <FileIcon size={13} class="opacity-70" />
    <span class="max-w-64 truncate font-mono">{part.filename ?? "file"}</span>
  </a>
{/if}
