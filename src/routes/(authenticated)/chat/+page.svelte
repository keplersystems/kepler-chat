<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ConversationDTO } from "$lib/contracts";
  import ChatLayout from "$lib/components/chat/ChatLayout.svelte";
  import { Button } from "$lib/components/ui/button";
  import PlusIcon from "@lucide/svelte/icons/plus";

  interface Props {
    data: { conversations: ConversationDTO[] };
  }

  const { data }: Props = $props();
  const localUser = { name: "Local" };

  const promptSuggestions = [
    { emoji: "💡", title: "Explain a concept", description: "Get help understanding any topic" },
    { emoji: "💻", title: "Write code", description: "Generate or debug code" },
    { emoji: "📊", title: "Analyze data", description: "Process and visualize data" },
  ];
</script>

<ChatLayout conversations={data.conversations} user={localUser}>
  <div class="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
    <div class="space-y-2">
      <h1 class="text-3xl font-bold tracking-tight">Welcome to Kepler</h1>
      <p class="text-lg text-muted-foreground">
        Start a new conversation or select an existing one from the sidebar.
      </p>
    </div>

    <form method="POST" action="?/create" use:enhance>
      <input type="hidden" name="title" value="New Chat" />
      <Button type="submit" size="lg" class="gap-2">
        <PlusIcon size={20} />
        Start new chat
      </Button>
    </form>

    <div class="grid gap-4 pt-8 sm:grid-cols-2 lg:grid-cols-3">
      {#each promptSuggestions as suggestion (suggestion.title)}
        <form method="POST" action="?/create" use:enhance>
          <button
            type="submit"
            name="title"
            value={suggestion.title}
            class="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <div class="mb-2 text-2xl">{suggestion.emoji}</div>
            <h3 class="font-semibold">{suggestion.title}</h3>
            <p class="text-sm text-muted-foreground">{suggestion.description}</p>
          </button>
        </form>
      {/each}
    </div>
  </div>
</ChatLayout>
