<script lang="ts">
  import type { ConversationDTO, PendingRequestDTO } from "$lib/contracts";
  import { browser } from "$app/environment";
  import { api } from "$lib/api";
  import { chat, toMessageViewList } from "$lib/state/chat.svelte";
  import type { ModelSelection, Provider } from "$lib/types";
  import ChatLayout from "$lib/components/chat/ChatLayout.svelte";
  import MessageList from "$lib/components/chat/MessageList.svelte";
  import MessageInput from "$lib/components/chat/MessageInput.svelte";
  import RequestDialog from "$lib/components/chat/RequestDialog.svelte";
  import OutputFilesSidebar from "$lib/components/chat/OutputFilesSidebar.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  interface Props {
    data: {
      conversations: ConversationDTO[];
      conversation: ConversationDTO;
      messages: unknown[];
      requests: PendingRequestDTO[];
      selectedModel: ModelSelection | null;
    };
  }

  const { data }: Props = $props();
  const localUser = { name: "Local" };
  const FILE_PANEL_STORAGE_PREFIX = "kepler:chat:files-panel-collapsed:";

  let providers = $state<Provider[]>([]);
  let connectedProviders = $state<string[]>([]);
  let selectedModelOverride = $state<ModelSelection | null>(null);
  let isLoadingProviders = $state(true);
  let outputFiles = $state<{ path: string; size: number; mtime: string; isDir: boolean }[]>([]);
  let isFilesPanelCollapsed = $state(false);
  let liveTitle = $state<string | null>(null);

  const conversationId = $derived(data.conversation.id);
  const headerTitle = $derived(liveTitle ?? data.conversation.title);
  const selectedModel = $derived(selectedModelOverride ?? data.selectedModel);

  const persistedMessages = $derived(toMessageViewList(data.messages));
  const visibleMessages = $derived([
    ...persistedMessages,
    ...chat.streamingMessagesFor(conversationId),
  ]);
  const currentRequest = $derived(data.requests[0] ?? chat.pendingRequests[0] ?? null);

  $effect(() => {
    chat.setPendingRequests(data.requests);
  });

  $effect(() => {
    void conversationId;
    selectedModelOverride = null;
    liveTitle = null;
  });

  $effect(() => {
    if (!browser) return;
    const stored = window.localStorage.getItem(`${FILE_PANEL_STORAGE_PREFIX}${conversationId}`);
    isFilesPanelCollapsed = stored === "true";
  });

  $effect(() => {
    if (!browser) return;
    window.localStorage.setItem(
      `${FILE_PANEL_STORAGE_PREFIX}${conversationId}`,
      String(isFilesPanelCollapsed),
    );
  });

  $effect(() => {
    void conversationId;
    loadFiles();
    loadProviders();
  });

  async function loadFiles() {
    const { data: response, error } = await api.api
      .conversations({ id: conversationId })
      .files.output.get();
    if (error || !response || "error" in response) return;
    outputFiles = response.files;
    if (outputFiles.length === 0) {
      isFilesPanelCollapsed = false;
    }
  }

  async function loadProviders() {
    isLoadingProviders = true;
    const { data: response, error } = await api.api.providers.get();
    if (error || !response) {
      isLoadingProviders = false;
      return;
    }
    providers = (response.providers.all ?? []) as Provider[];
    connectedProviders = response.providers.connected ?? [];

    if (!selectedModel && connectedProviders.length > 0 && providers.length > 0) {
      const firstConnected = providers.find((p) => connectedProviders.includes(p.id));
      const modelEntries = firstConnected?.models ? Object.entries(firstConnected.models) : [];
      if (firstConnected && modelEntries.length > 0) {
        const [modelId, model] = modelEntries[0];
        selectedModelOverride = {
          providerID: firstConnected.id,
          modelID: model.id ?? modelId,
        };
      }
    }
    isLoadingProviders = false;
  }

  async function handleModelChange(model: ModelSelection) {
    selectedModelOverride = model;
    await api.api.conversations({ id: conversationId }).model.put(model);
  }

  async function handleSendMessage(text: string, model: ModelSelection, files?: File[]) {
    if (!text.trim() && (!files || files.length === 0)) return false;
    chat.setError(null);

    const attachments: Array<{ path: string; mimeType?: string; filename?: string }> = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const { data: uploaded, error } = await api.api
          .conversations({ id: conversationId })
          .files.upload.post({ file });
        if (error || !uploaded || "error" in uploaded) {
          chat.setError(
            (error?.value as { error?: string } | undefined)?.error ?? "Failed to upload file",
          );
          return false;
        }
        attachments.push({
          path: uploaded.file.path,
          mimeType: uploaded.file.mimeType,
          filename: file.name,
        });
      }
    }

    const succeeded = await chat.send(
      conversationId,
      { text, model, attachments },
      (title) => (liveTitle = title),
    );
    if (succeeded) {
      await loadFiles();
    }
    return succeeded;
  }

</script>

<ChatLayout
  conversations={data.conversations}
  currentConversationId={conversationId}
  user={localUser}
>
  <div class="flex h-full">
    <div class="flex flex-1 flex-col min-w-0">
      <header class="flex h-14 items-center justify-between border-b px-4">
        <h1 class="truncate text-lg font-semibold">{headerTitle}</h1>
        <div class="flex items-center gap-2">
          <Tooltip.Root>
            <Tooltip.Trigger
              onclick={loadFiles}
              class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Refresh files"
            >
              <RefreshCwIcon size={16} />
            </Tooltip.Trigger>
            <Tooltip.Content>Refresh files</Tooltip.Content>
          </Tooltip.Root>
        </div>
      </header>

      <MessageList messages={visibleMessages} isStreaming={chat.isStreaming} />

      {#if chat.lastError}
        <div class="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {chat.lastError}
        </div>
      {/if}

      <MessageInput
        onSubmit={handleSendMessage}
        disabled={chat.isStreaming || isLoadingProviders}
        placeholder={isLoadingProviders ? "Loading models..." : "Message..."}
        {providers}
        {connectedProviders}
        {selectedModel}
        onModelChange={handleModelChange}
      />
    </div>

    {#if outputFiles.length > 0}
      <OutputFilesSidebar
        {conversationId}
        files={outputFiles}
        bind:collapsed={isFilesPanelCollapsed}
        onRefresh={loadFiles}
      />
    {/if}
  </div>

  <RequestDialog request={currentRequest} />
</ChatLayout>
