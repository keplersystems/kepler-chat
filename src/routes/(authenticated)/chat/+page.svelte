<script lang="ts">
  import { agentCatalog } from "$lib/state/agents.svelte";
  import { agentConfig } from "$lib/state/agent-config.svelte";
  import { modelPrefs } from "$lib/state/model-prefs.svelte";
  import { startChat } from "$lib/state/start-chat";
  import { ThinkingOrb } from "$lib/components/ui/orb";
  import type { AgentId, ConversationMode, SessionConfigDTO } from "$lib/contracts";
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
  let selectedAgent = $state<AgentId | null>(null);
  let selectedMode = $state<ConversationMode>("chat");
  let selectedOptions = $state<Record<string, string>>({});

  $effect(() => {
    agentCatalog.loadDefault().then((agentId) => {
      if (!selectedAgent) selectedAgent = agentId;
    });
  });

  const chatModeAvailable = $derived(
    agentCatalog.agents.find((agent) => agent.agentId === selectedAgent)?.capabilities
      .chatMode ?? true,
  );
  $effect(() => {
    if (!chatModeAvailable && selectedMode === "chat") selectedMode = "agent";
  });

  $effect(() => {
    const agentId = selectedAgent;
    if (!agentId) return;
    const remembered = modelPrefs.lastModelFor(agentId);
    selectedOptions = remembered ? { model: remembered } : {};
  });

  // The option set can depend on the model, so refetch whenever it changes.
  $effect(() => {
    const agentId = selectedAgent;
    if (!agentId) return;
    void agentConfig.load(agentId, selectedOptions.model);
  });

  // Choices made before the session exists are applied when it is created.
  const composeConfig = $derived.by((): SessionConfigDTO | null => {
    const config = selectedAgent
      ? agentConfig.configFor(selectedAgent, selectedOptions.model)
      : null;
    if (!config) return null;
    return {
      ...config,
      configOptions: config.configOptions.map((option) =>
        option.type === "select" && selectedOptions[option.id]
          ? { ...option, currentValue: selectedOptions[option.id] }
          : option,
      ),
    };
  });

  const handleSend = (text: string, files?: File[], mediaIds?: string[]) =>
    selectedAgent
      ? startChat(text, selectedAgent, selectedMode, files, undefined, mediaIds, selectedOptions)
      : Promise.resolve(false);
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
      disabled={agentCatalog.loading || !selectedAgent}
      placeholder="What are we working on?"
      agentId={selectedAgent}
      onAgentChange={(agentId) => (selectedAgent = agentId)}
      mode={selectedMode}
      onModeSelect={(mode) => (selectedMode = mode)}
      {chatModeAvailable}
      config={composeConfig}
      modelInfo={selectedAgent ? agentConfig.modelInfoFor(selectedAgent, selectedOptions.model) : {}}
      onConfigChange={(configId, value) =>
        (selectedOptions = { ...selectedOptions, [configId]: value })}
      bind:text={draft}
    />
    {#if agentCatalog.error}
      <p class="mt-2 text-center text-sm text-destructive">{agentCatalog.error}</p>
    {:else if !agentCatalog.loading && agentCatalog.agents.every((agent) => !agent.available)}
      <p class="mt-2 text-center text-sm text-muted-foreground">
        No agents installed. Add one from
        <a href="/settings/agents" class="underline hover:text-foreground">Settings → Agents</a>.
      </p>
    {/if}
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
