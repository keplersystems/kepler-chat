<script lang="ts">
  import { modelCatalog } from "$lib/state/providers.svelte";
  import { startChat } from "$lib/state/start-chat";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import type { ModelSelection } from "$lib/types";
  import MessageInput from "$lib/components/chat/MessageInput.svelte";
  import CodeIcon from "@lucide/svelte/icons/code";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import PenLineIcon from "@lucide/svelte/icons/pen-line";
  import TerminalIcon from "@lucide/svelte/icons/terminal";

  const suggestions = [
    { icon: CodeIcon, label: "Code", prompt: "Help me write " },
    { icon: PenLineIcon, label: "Write", prompt: "Help me draft " },
    { icon: FileTextIcon, label: "Summarize", prompt: "Summarize this: " },
    { icon: TerminalIcon, label: "Analyze", prompt: "Run an analysis on " },
    { icon: GlobeIcon, label: "Research", prompt: "Research " },
  ];

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Good night";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  let draft = $state("");
  let selectedModel = $state<ModelSelection | null>(null);

  $effect(() => {
    modelCatalog.load().then(() => {
      if (!selectedModel) selectedModel = modelCatalog.defaultModel();
    });
  });

  function handleModelChange(model: ModelSelection) {
    selectedModel = model;
    modelCatalog.remember(model);
  }

  const handleSend = (
    text: string,
    model: ModelSelection,
    files?: File[],
    mediaIds?: string[],
    variant?: string,
  ) => startChat(text, model, files, undefined, mediaIds, variant);
</script>

<div class="flex h-full flex-col items-center justify-center gap-8 px-4 pb-16 sm:px-8">
  <div class="flex flex-col items-center gap-5">
    <ThinkingOrb size={64} state="searching" speed={0.7} />
    <p class="font-mono text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
      {greeting}
    </p>
  </div>

  <div class="w-full max-w-3xl">
    <MessageInput
      onSubmit={handleSend}
      disabled={modelCatalog.loading}
      placeholder="What are we working on?"
      providers={modelCatalog.providers}
      connectedProviders={modelCatalog.connected}
      {selectedModel}
      onModelChange={handleModelChange}
      bind:text={draft}
    />
  </div>

  <div class="flex max-w-xl flex-wrap items-center justify-center gap-2">
    {#each suggestions as suggestion (suggestion.label)}
      <button
        type="button"
        onclick={() => (draft = suggestion.prompt)}
        class="flex items-center gap-2 rounded-lg border bg-transparent px-3.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <suggestion.icon size={15} aria-hidden="true" />
        {suggestion.label}
      </button>
    {/each}
  </div>
</div>
