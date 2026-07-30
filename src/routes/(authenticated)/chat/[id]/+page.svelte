<script lang="ts">
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Message, Part } from "@opencode-ai/sdk/v2";
  import type { ConversationDTO, PendingRequestDTO, ProjectDTO } from "$lib/contracts";
  import { browser } from "$app/environment";
  import { goto, invalidateAll } from "$app/navigation";
  import { api } from "$lib/api";
  import { chat, toMessageViewList, type MessageView } from "$lib/state/chat.svelte";
  import { fileAttachmentInput, messageText } from "$lib/messages";
  import { modelCatalog } from "$lib/state/providers.svelte";
  import type { ModelSelection } from "$lib/types";
  import MessageList from "$lib/components/chat/MessageList.svelte";
  import MessageInput from "$lib/components/chat/MessageInput.svelte";
  import RequestDialog from "$lib/components/chat/RequestDialog.svelte";
  import TodoRail from "$lib/components/chat/TodoRail.svelte";
  import OutputFilesSidebar from "$lib/components/chat/OutputFilesSidebar.svelte";

  interface Props {
    data: {
      conversations: ConversationDTO[];
      projects: ProjectDTO[];
      conversation: ConversationDTO;
      messages: Array<{ info: Message; parts: Part[] }>;
      requests: PendingRequestDTO[];
      selectedModel: ModelSelection | null;
    };
  }

  const { data }: Props = $props();
  const FILE_PANEL_STORAGE_PREFIX = "kepler:chat:files-panel-collapsed:";

  let selectedModelOverride = $state<ModelSelection | null>(null);
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
    modelCatalog.load().then(() => {
      if (!selectedModel) selectedModelOverride = modelCatalog.defaultModel();
    });
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

  async function handleModelChange(model: ModelSelection) {
    selectedModelOverride = model;
    modelCatalog.remember(model);
    await api.api.conversations({ id: conversationId }).model.put(model);
  }

  async function handleBranch(message: MessageView) {
    const { data: created, error } = await api.api
      .conversations({ id: conversationId })
      .branch.post({ messageID: message.id });
    if (error || !created || "error" in created) {
      chat.setError("Failed to branch conversation");
      return;
    }
    await goto(`/chat/${created.id}`);
  }

  async function handleEdit(message: MessageView, text: string) {
    if (!selectedModel || chat.isStreamingFor(conversationId)) return;
    chat.setError(null);
    const { error } = await api.api
      .conversations({ id: conversationId })
      .revert.post({ messageID: message.id });
    if (error) {
      chat.setError("Failed to edit message");
      return;
    }
    await invalidateAll();
    const attachments = message.parts
      .filter((part) => part.type === "file")
      .map(fileAttachmentInput)
      .filter((a) => a !== null);
    await chat.send(
      conversationId,
      { text, model: selectedModel, attachments },
      (title) => (liveTitle = title),
    );
  }

  function handleRegenerate(message: MessageView) {
    const index = visibleMessages.findIndex((m) => m.id === message.id);
    const previousUser = visibleMessages
      .slice(0, index)
      .reverse()
      .find((m) => m.role === "user");
    if (!previousUser) return;
    void handleEdit(previousUser, messageText(previousUser));
  }

  async function handleDeleteMessage(message: MessageView) {
    const { error } = await api.api
      .conversations({ id: conversationId })
      .messages({ messageID: message.id })
      .delete();
    if (error) {
      chat.setError("Failed to delete message");
      return;
    }
    await invalidateAll();
  }

  async function handleSendMessage(
    text: string,
    model: ModelSelection,
    files?: File[],
    mediaIds?: string[],
    variant?: string,
  ) {
    if (!text.trim() && (!files || files.length === 0) && (!mediaIds || mediaIds.length === 0))
      return false;
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

    for (const mediaId of mediaIds ?? []) {
      const { data: linked, error: linkError } = await api.api
        .conversations({ id: conversationId })
        .files["from-library"].post({ mediaId });
      if (linkError || !linked || "error" in linked) {
        chat.setError("Failed to attach from library");
        return false;
      }
      attachments.push(linked.file);
    }

    const succeeded = await chat.send(
      conversationId,
      { text, model, attachments, variant },
      (title) => (liveTitle = title),
    );
    if (succeeded) {
      await loadFiles();
    }
    return succeeded;
  }
</script>

<div class="flex h-full">
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="flex h-12 shrink-0 items-center px-4 max-md:pl-14">
      {#key headerTitle}
        <h1 class="t-rise truncate text-sm font-medium text-foreground/90">{headerTitle}</h1>
      {/key}
    </header>

    {#if chat.isStreamingFor(conversationId)}
      <TodoRail todos={chat.todosFor(conversationId)} />
    {/if}

    <MessageList
      messages={visibleMessages}
      isStreaming={chat.isStreamingFor(conversationId)}
      onBranch={handleBranch}
      onDelete={handleDeleteMessage}
      onEdit={handleEdit}
      onRegenerate={handleRegenerate}
    />

    {#if chat.lastError}
      <div
        class="mx-auto w-full max-w-[52rem] px-4"
        transition:slide={{ duration: 240, easing: cubicOut }}
      >
        <div class="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {chat.lastError}
        </div>
      </div>
    {/if}

    <div class="px-4 pb-4">
      <div class="mx-auto w-full max-w-[52rem]">
        <MessageInput
          onSubmit={handleSendMessage}
          disabled={modelCatalog.loading}
          isStreaming={chat.isStreamingFor(conversationId)}
          onStop={() => chat.stop(conversationId)}
          placeholder="Reply…"
          providers={modelCatalog.providers}
          connectedProviders={modelCatalog.connected}
          {selectedModel}
          onModelChange={handleModelChange}
        />
      </div>
    </div>
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
