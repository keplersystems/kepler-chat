<script lang="ts">
  import ChatLayout from '../../../components/chat/ChatLayout.svelte';
  import Button from '../../../components/ui/Button.svelte';
  import { api } from '$lib/api/chat';
  import { goto } from '$app/navigation';

  let { data } = $props();
  const localUser = { name: "Local" };
  
  async function createNewChat() {
    try {
      const response = await api.createConversation({ title: 'New Chat' });
      goto(`/chat/${response.id}`);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }
</script>

<ChatLayout 
  conversations={data.conversations} 
  user={localUser}
>
  <div class="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
    <div class="space-y-2">
      <h1 class="text-3xl font-bold tracking-tight">Welcome to Kepler</h1>
      <p class="text-lg text-muted-foreground">
        Start a new conversation or select an existing one from the sidebar.
      </p>
    </div>
    
    <Button onclick={createNewChat} size="lg" class="gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </svg>
      Start new chat
    </Button>

    <div class="grid gap-4 pt-8 sm:grid-cols-2 lg:grid-cols-3">
      <button
        onclick={() => api.createConversation({ title: 'Explain a concept' }).then(c => goto(`/chat/${c.id}`))}
        class="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <div class="mb-2 text-2xl">💡</div>
        <h3 class="font-semibold">Explain a concept</h3>
        <p class="text-sm text-muted-foreground">Get help understanding any topic</p>
      </button>
      
      <button
        onclick={() => api.createConversation({ title: 'Write code' }).then(c => goto(`/chat/${c.id}`))}
        class="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <div class="mb-2 text-2xl">💻</div>
        <h3 class="font-semibold">Write code</h3>
        <p class="text-sm text-muted-foreground">Generate or debug code</p>
      </button>
      
      <button
        onclick={() => api.createConversation({ title: 'Analyze data' }).then(c => goto(`/chat/${c.id}`))}
        class="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <div class="mb-2 text-2xl">📊</div>
        <h3 class="font-semibold">Analyze data</h3>
        <p class="text-sm text-muted-foreground">Process and visualize data</p>
      </button>
    </div>
  </div>
</ChatLayout>
