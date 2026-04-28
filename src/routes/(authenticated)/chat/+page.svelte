<script lang="ts">
  import { enhance } from "$app/forms";
  import type { ConversationDTO } from "$lib/contracts";
  import ChatLayout from "$lib/components/chat/ChatLayout.svelte";
  import { Button } from "$lib/components/ui/button";

  interface Props {
    data: { conversations: ConversationDTO[] };
  }

  const { data }: Props = $props();
  const localUser = { name: "Local" };
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
        Start new chat
      </Button>
    </form>

    <div class="grid gap-4 pt-8 sm:grid-cols-2 lg:grid-cols-3">
      <form method="POST" action="?/create" use:enhance>
        <button
          type="submit"
          name="title"
          value="Explain a concept"
          class="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <div class="mb-2 text-2xl">💡</div>
          <h3 class="font-semibold">Explain a concept</h3>
          <p class="text-sm text-muted-foreground">Get help understanding any topic</p>
        </button>
      </form>

      <form method="POST" action="?/create" use:enhance>
        <button
          type="submit"
          name="title"
          value="Write code"
          class="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <div class="mb-2 text-2xl">💻</div>
          <h3 class="font-semibold">Write code</h3>
          <p class="text-sm text-muted-foreground">Generate or debug code</p>
        </button>
      </form>

      <form method="POST" action="?/create" use:enhance>
        <button
          type="submit"
          name="title"
          value="Analyze data"
          class="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <div class="mb-2 text-2xl">📊</div>
          <h3 class="font-semibold">Analyze data</h3>
          <p class="text-sm text-muted-foreground">Process and visualize data</p>
        </button>
      </form>
    </div>
  </div>
</ChatLayout>
