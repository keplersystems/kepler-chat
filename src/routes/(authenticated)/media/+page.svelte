<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiErrorMessage } from "$lib/api";
  import type { MediaDTO } from "$lib/contracts";
  import { formatSize, relativeTime } from "$lib/utils";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import FileIcon from "@lucide/svelte/icons/file";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";

  type Tab = "all" | "images" | "documents";

  let items = $state<MediaDTO[] | null>(null);
  let loadError = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let query = $state("");
  let tab = $state<Tab>("all");
  let pendingDelete = $state<MediaDTO | null>(null);
  let deleting = $state(false);
  let fileInput: HTMLInputElement | null = $state(null);

  const isImage = (m: MediaDTO) => m.mimeType?.startsWith("image/") ?? false;

  const filtered = $derived(
    (items ?? []).filter((m) => {
      if (tab === "images" && !isImage(m)) return false;
      if (tab === "documents" && isImage(m)) return false;
      return m.filename.toLowerCase().includes(query.trim().toLowerCase());
    }),
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "all", label: "All" },
    { id: "images", label: "Images" },
    { id: "documents", label: "Documents" },
  ];

  async function load() {
    const { data, error } = await api.api.media.get();
    if (error) {
      loadError = apiErrorMessage(error.value, "Failed to load media");
      return;
    }
    items = data.media;
    loadError = null;
  }

  onMount(load);

  async function handleUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    actionError = null;
    for (const file of input.files ?? []) {
      const { error } = await api.api.media.post({ file });
      if (error) {
        actionError = apiErrorMessage(error.value, `Failed to upload ${file.name}`);
        break;
      }
    }
    input.value = "";
    await load();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    deleting = true;
    const { error } = await api.api.media({ id: pendingDelete.id }).delete();
    deleting = false;
    if (error) {
      actionError = apiErrorMessage(error.value, "Failed to delete");
      return;
    }
    pendingDelete = null;
    actionError = null;
    await load();
  }
</script>

<div class="h-full overflow-y-auto">
  <div class="mx-auto w-full max-w-3xl px-6 py-10">
    <div class="flex items-center justify-between max-md:pl-10">
      <h1 class="text-xl font-semibold tracking-tight text-foreground">Media</h1>
      <input bind:this={fileInput} type="file" multiple class="hidden" onchange={handleUpload} />
      <Button variant="secondary" size="sm" class="gap-1.5" onclick={() => fileInput?.click()}>
        <PlusIcon size={15} />
        Upload
      </Button>
    </div>

    <div class="mt-6 flex items-center gap-2.5 rounded-xl border bg-input px-3.5">
      <SearchIcon size={15} class="shrink-0 text-muted-foreground" />
      <input
        bind:value={query}
        placeholder="Search your files…"
        class="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        aria-label="Search media"
      />
    </div>

    <div class="mt-5 flex items-center gap-1">
      {#each tabs as t (t.id)}
        <button
          type="button"
          onclick={() => (tab = t.id)}
          class="rounded-full px-3.5 py-1.5 text-sm {tab === t.id
            ? 'bg-secondary font-medium text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
        >
          {t.label}
        </button>
      {/each}
    </div>

    {#if actionError}
      <p class="mt-4 text-sm text-destructive" role="alert">{actionError}</p>
    {/if}

    {#if loadError}
      <p class="mt-6 text-sm text-destructive" role="alert">{loadError}</p>
    {:else if items === null}
      <div class="flex justify-center py-16">
        <ThinkingOrb size={20} state="searching" />
      </div>
    {:else}
      <ul class="mt-3 divide-y divide-border">
        {#each filtered as item (item.id)}
          <li class="group flex items-center gap-3.5 px-2 py-3">
            {#if isImage(item)}
              <img
                src={`/api/media/${item.id}/raw`}
                alt={item.filename}
                loading="lazy"
                class="h-10 w-10 shrink-0 rounded-lg border object-cover"
              />
            {:else}
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground"
              >
                {#if item.mimeType?.startsWith("text/")}
                  <FileTextIcon size={17} />
                {:else}
                  <FileIcon size={17} />
                {/if}
              </span>
            {/if}
            <div class="min-w-0 flex-1">
              <p class="truncate text-[15px] text-foreground">{item.filename}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {relativeTime(item.createdAt)} · {formatSize(item.size)}
              </p>
            </div>
            <div
              class="flex items-center gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100"
            >
              <a
                href={`/api/media/${item.id}/raw?disposition=attachment`}
                download={item.filename}
                class="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Download ${item.filename}`}
              >
                <DownloadIcon size={15} />
              </a>
              <button
                type="button"
                onclick={() => (pendingDelete = item)}
                class="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Delete ${item.filename}`}
              >
                <Trash2Icon size={15} />
              </button>
            </div>
          </li>
        {:else}
          <li class="py-16 text-center text-sm text-muted-foreground">
            {query || tab !== "all"
              ? "Nothing matches."
              : "Attachments you upload in any chat collect here."}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<Dialog.Root open={pendingDelete !== null} onOpenChange={(open) => !open && (pendingDelete = null)}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Delete "{pendingDelete?.filename}"</Dialog.Title>
      <Dialog.Description>
        Removes the file from your library. Conversations that already attached it keep their
        copies.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (pendingDelete = null)}>Cancel</Button>
      <Button variant="destructive" disabled={deleting} onclick={confirmDelete}>
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
