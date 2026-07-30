<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { api, apiErrorMessage } from "$lib/api";
  import type { ConversationDTO, ProjectDTO } from "$lib/contracts";
  import { relativeTime } from "$lib/utils";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as Dialog from "$lib/components/ui/dialog";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";

  interface Props {
    data: { conversations: ConversationDTO[]; projects: ProjectDTO[] };
  }

  const { data }: Props = $props();

  interface MessageResult {
    conversationId: string;
    title: string;
    role: string;
    snippet: string;
    time: number;
  }

  let query = $state("");
  let messageResults = $state<MessageResult[]>([]);
  let searchTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    const q = query.trim();
    clearTimeout(searchTimer);
    if (q.length < 2 || selecting) {
      messageResults = [];
      return;
    }
    searchTimer = setTimeout(async () => {
      const { data: response, error } = await api.api.search.get({ query: { q } });
      if (!error && response) messageResults = response.results as MessageResult[];
    }, 200);
    return () => clearTimeout(searchTimer);
  });
  let selecting = $state(false);
  let selected = $state<string[]>([]);
  let confirmOpen = $state(false);
  let deleting = $state(false);
  let deleteError = $state<string | null>(null);

  const filtered = $derived(
    data.conversations.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const allSelected = $derived(filtered.length > 0 && selected.length === filtered.length);

  function exitSelection() {
    selecting = false;
    selected = [];
  }

  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
  }

  async function deleteSelected() {
    deleting = true;
    deleteError = null;
    const { error } = await api.api.conversations.delete({ ids: selected });
    deleting = false;
    if (error) {
      deleteError = apiErrorMessage(error.value, "Failed to delete chats");
      return;
    }
    confirmOpen = false;
    exitSelection();
    await invalidateAll();
  }
</script>

<div class="h-full overflow-y-auto">
  <div class="mx-auto w-full max-w-3xl px-6 py-10">
    <div class="flex items-center justify-between max-md:pl-10">
      <h1 class="text-xl font-semibold tracking-tight text-foreground">Chats</h1>
      <a href="/chat" class={buttonVariants({ variant: "secondary", size: "sm" }) + " gap-1.5"}>
        <PlusIcon size={15} />
        New chat
      </a>
    </div>

    <div class="mt-6 flex items-center gap-2.5 rounded-xl border bg-input px-3.5">
      <SearchIcon size={15} class="shrink-0 text-muted-foreground" />
      <input
        bind:value={query}
        placeholder="Search your chats…"
        class="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground"
        aria-label="Search chats"
      />
    </div>

    <div class="mt-5 flex h-8 items-center gap-4 text-sm text-muted-foreground">
      {#if selecting}
        <Checkbox
          checked={allSelected}
          onCheckedChange={(checked) => (selected = checked ? filtered.map((c) => c.id) : [])}
          aria-label="Select all chats"
        />
        <span>{selected.length} selected</span>
        <div class="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onclick={exitSelection}>Cancel</Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selected.length === 0}
            onclick={() => (confirmOpen = true)}
          >
            Delete {selected.length > 0 ? selected.length : ""}
          </Button>
        </div>
      {:else}
        <span>
          {filtered.length}
          {filtered.length === 1 ? "chat" : "chats"} with Kepler
        </span>
        {#if filtered.length > 0}
          <button
            type="button"
            class="font-medium text-primary hover:underline"
            onclick={() => (selecting = true)}
          >
            Select
          </button>
        {/if}
      {/if}
    </div>

    <ul class="mt-2 divide-y divide-border">
      {#each filtered as conversation (conversation.id)}
        <li>
          {#if selecting}
            <button
              type="button"
              onclick={() => toggle(conversation.id)}
              class="flex w-full items-center gap-3.5 rounded-lg px-2 py-3.5 text-left hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(conversation.id)}
                onCheckedChange={() => toggle(conversation.id)}
                aria-label={`Select ${conversation.title}`}
              />
              <span class="min-w-0">
                <span class="block truncate text-[15px] text-foreground">{conversation.title}</span>
                <span class="mt-0.5 block text-xs text-muted-foreground">
                  Last message {relativeTime(conversation.updated_at)}
                </span>
              </span>
            </button>
          {:else}
            <a
              href={`/chat/${conversation.id}`}
              class="block rounded-lg px-2 py-3.5 hover:bg-accent"
            >
              <p class="truncate text-[15px] text-foreground">{conversation.title}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                Last message {relativeTime(conversation.updated_at)}
              </p>
            </a>
          {/if}
        </li>
      {:else}
        <li class="py-12 text-center text-sm text-muted-foreground">
          {query ? `No chats match "${query}"` : "No chats yet."}
        </li>
      {/each}
    </ul>

    {#if messageResults.length > 0}
      <p class="mt-8 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
        In messages
      </p>
      <ul class="mt-1 divide-y divide-border">
        {#each messageResults as result, index (`${result.conversationId}:${index}`)}
          <li>
            <a
              href={`/chat/${result.conversationId}`}
              class="block rounded-lg px-2 py-3 hover:bg-accent"
            >
              <span class="flex items-baseline justify-between gap-4">
                <span class="truncate text-sm font-medium text-foreground">{result.title}</span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(result.time)}
                </span>
              </span>
              <span class="mt-0.5 block truncate text-sm text-muted-foreground">
                <span class="text-muted-foreground/70">{result.role === "user" ? "You: " : ""}</span>{result.snippet}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<Dialog.Root bind:open={confirmOpen}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Delete {selected.length} {selected.length === 1 ? "chat" : "chats"}</Dialog.Title>
      <Dialog.Description>
        This permanently deletes the selected conversations and all their generated files. This
        cannot be undone.
      </Dialog.Description>
    </Dialog.Header>
    {#if deleteError}
      <p class="text-sm text-destructive" role="alert">{deleteError}</p>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
      <Button variant="destructive" disabled={deleting} onclick={deleteSelected}>
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
