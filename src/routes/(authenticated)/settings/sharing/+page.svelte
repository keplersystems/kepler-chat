<script lang="ts">
  import { api } from "$lib/api";
  import { invalidateAll } from "$app/navigation";
  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();

  let busy = $state<string | null>(null);
  let copied = $state<string | null>(null);
  let actionError = $state<string | null>(null);

  const shareUrl = (token: string) => `${location.origin}/share/${token}`;

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(shareUrl(token));
    copied = token;
    setTimeout(() => (copied = null), 2000);
  }

  async function stopSharing(id: string) {
    busy = id;
    actionError = null;
    const { error } = await api.api.conversations({ id }).share.delete();
    busy = null;
    if (error) {
      actionError = "Failed to stop sharing";
      return;
    }
    await invalidateAll();
  }
</script>

<div class="space-y-6">
  <p class="text-sm text-muted-foreground">
    Anyone with one of these links can read the conversation and download its files, without
    signing in.
  </p>

  {#if actionError}
    <p class="text-sm text-destructive">{actionError}</p>
  {/if}

  {#if data.shared.length === 0}
    <p class="text-sm text-muted-foreground">No conversations are shared.</p>
  {:else}
    <div class="divide-y divide-border">
      {#each data.shared as conversation (conversation.id)}
        <div class="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
          <div class="min-w-0 flex-1">
            <a
              href="/chat/{conversation.id}"
              class="block truncate text-sm text-foreground hover:underline"
            >
              {conversation.title}
            </a>
            <a
              href={`/share/${conversation.token}`}
              target="_blank"
              rel="noopener noreferrer"
              class="block truncate font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              /share/{conversation.token}
            </a>
          </div>
          <button
            type="button"
            onclick={() => void copyLink(conversation.token)}
            class="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {copied === conversation.token ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            disabled={busy === conversation.id}
            onclick={() => void stopSharing(conversation.id)}
            class="rounded-md bg-secondary px-2.5 py-1 text-xs text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            {busy === conversation.id ? "Stopping…" : "Stop sharing"}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
