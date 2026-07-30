<script lang="ts">
  import { api, apiErrorMessage } from "$lib/api";
  import type { MediaDTO } from "$lib/contracts";
  import { relativeTime } from "$lib/utils";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as Dialog from "$lib/components/ui/dialog";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import FileIcon from "@lucide/svelte/icons/file";
  import SearchIcon from "@lucide/svelte/icons/search";

  interface Props {
    open: boolean;
    onAttach: (items: MediaDTO[]) => void;
  }

  let { open = $bindable(), onAttach }: Props = $props();

  let items = $state<MediaDTO[] | null>(null);
  let loadError = $state<string | null>(null);
  let query = $state("");
  let selected = $state<string[]>([]);

  $effect(() => {
    if (!open) {
      selected = [];
      query = "";
      return;
    }
    api.api.media.get().then(({ data, error }) => {
      if (error) {
        loadError = apiErrorMessage(error.value, "Failed to load media");
        return;
      }
      items = data.media as MediaDTO[];
      loadError = null;
    });
  });

  const filtered = $derived(
    (items ?? []).filter((m) => m.filename.toLowerCase().includes(query.trim().toLowerCase())),
  );

  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
  }

  function attach() {
    onAttach((items ?? []).filter((m) => selected.includes(m.id)));
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Add from library</Dialog.Title>
    </Dialog.Header>

    <div class="flex items-center gap-2 rounded-lg border bg-input px-3">
      <SearchIcon size={14} class="shrink-0 text-muted-foreground" />
      <input
        bind:value={query}
        placeholder="Search…"
        class="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
        aria-label="Search library"
      />
    </div>

    {#if loadError}
      <p class="text-sm text-destructive" role="alert">{loadError}</p>
    {:else if items === null}
      <div class="flex justify-center py-8">
        <ThinkingOrb size={20} state="searching" />
      </div>
    {:else}
      <ul class="max-h-72 divide-y divide-border overflow-y-auto">
        {#each filtered as item (item.id)}
          <li>
            <button
              type="button"
              onclick={() => toggle(item.id)}
              class="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(item.id)}
                onCheckedChange={() => toggle(item.id)}
                aria-label={`Select ${item.filename}`}
              />
              {#if item.mimeType?.startsWith("image/")}
                <img
                  src={`/api/media/${item.id}/raw`}
                  alt=""
                  loading="lazy"
                  class="h-8 w-8 shrink-0 rounded-md border object-cover"
                />
              {:else}
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground"
                >
                  <FileIcon size={14} />
                </span>
              {/if}
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-foreground">{item.filename}</span>
                <span class="block text-xs text-muted-foreground">
                  {relativeTime(item.createdAt)}
                </span>
              </span>
            </button>
          </li>
        {:else}
          <li class="py-8 text-center text-sm text-muted-foreground">
            {query ? "Nothing matches." : "Library is empty — attachments collect here."}
          </li>
        {/each}
      </ul>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button disabled={selected.length === 0} onclick={attach}>
        Attach{selected.length > 0 ? ` ${selected.length}` : ""}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
