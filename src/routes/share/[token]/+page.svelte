<script lang="ts">
  import MessageBubble from "$lib/components/chat/MessageBubble.svelte";
  import KeplerMark from "$lib/components/ui/KeplerMark.svelte";
  import { toMessageViewList } from "$lib/messages";
  import type { PageData } from "./$types";

  const { data }: { data: PageData } = $props();

  const messages = $derived(toMessageViewList(data.messages));
</script>

<svelte:head>
  <title>{data.title}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-10 sm:px-8">
  <header class="mb-8 flex items-center gap-3 border-b border-border pb-6">
    <KeplerMark size={40} class="shrink-0 text-foreground" />
    <div class="min-w-0">
      <h1 class="truncate font-serif text-2xl text-foreground">{data.title}</h1>
      <p class="text-xs text-muted-foreground">Shared conversation, read-only</p>
    </div>
  </header>

  <div class="flex flex-col gap-6">
    {#each messages as message (message.id)}
      <MessageBubble {message} mode={data.mode} />
    {/each}
  </div>
</div>
