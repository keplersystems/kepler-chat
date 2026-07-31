<script lang="ts">
  import { untrack } from "svelte";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { isModelOption } from "$lib/contracts";
import type {
    AgentId,
    ConversationDTO,
    ElicitationReply,
    FileEntryDTO,
    MessageView,
    PendingRequestDTO,
    ProjectDTO,
  } from "$lib/contracts";
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import { chat } from "$lib/state/chat.svelte";
  import { uploadAttachments } from "$lib/state/attachments";
  import { toMessageViewList } from "$lib/messages";
  import {
    flattenSelectValues,
    sessionConfig,
    type LoadedSessionConfig,
  } from "$lib/state/session-config.svelte";
  import { modelPrefs } from "$lib/state/model-prefs.svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import MessageList from "$lib/components/chat/MessageList.svelte";
  import MessageInput from "$lib/components/chat/MessageInput.svelte";
  import RequestDialog from "$lib/components/chat/RequestDialog.svelte";
  import PlanRail from "$lib/components/chat/PlanRail.svelte";
  import OutputFilesSidebar from "$lib/components/chat/OutputFilesSidebar.svelte";

  interface Props {
    data: {
      conversations: ConversationDTO[];
      projects: ProjectDTO[];
      conversation: ConversationDTO;
      messages: MessageView[];
      requests: PendingRequestDTO[];
    };
  }

  const { data }: Props = $props();
  const FILE_PANEL_STORAGE_PREFIX = "kepler:chat:files-panel-collapsed:";

  let composer = $state<MessageInput | null>(null);
  let outputFiles = $state<FileEntryDTO[]>([]);
  let isFilesPanelCollapsed = $state(false);
  let liveTitle = $state<string | null>(null);

  const conversationId = $derived(data.conversation.id);
  const headerTitle = $derived(liveTitle ?? data.conversation.title);
  const config = $derived(chat.configFor(conversationId));
  const usage = $derived(chat.usageFor(conversationId));
  const commands = $derived(chat.commandsFor(conversationId));

  const persistedMessages = $derived(toMessageViewList(data.messages));
  // Streaming copies win over persisted ones so a reattached stream updates
  // the partially-persisted assistant message in place.
  const visibleMessages = $derived.by(() => {
    const streaming = chat.streamingMessagesFor(conversationId);
    const streamingById = new Map(streaming.map((m) => [m.id, m]));
    const persistedIds = new Set(persistedMessages.map((m) => m.id));
    return [
      ...persistedMessages.map((m) => streamingById.get(m.id) ?? m),
      ...streaming.filter((m) => !persistedIds.has(m.id)),
    ];
  });
  const currentRequest = $derived(chat.pendingRequests[0] ?? data.requests[0] ?? null);

  $effect(() => {
    chat.setPendingRequests(data.requests);
  });

  $effect(() => {
    void conversationId;
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
    const id = conversationId;
    const agentId = data.conversation.agent_id;
    loadFiles();
    void loadSession(id, agentId);
  });

  // Pick up a generation started before this page loaded (reload, other tab).
  $effect(() => {
    const id = conversationId;
    if (!untrack(() => chat.isStreamingFor(id))) {
      void chat.attach(id, (title) => (liveTitle = title));
    }
  });

  // Commands are pushed by the agent right after the session is established,
  // which the config load does, so they are only readable afterwards.
  async function loadSession(id: string, agentId: AgentId) {
    const loaded = await sessionConfig.load(id);
    await chat.loadCommands(id);
    if (loaded) applyRememberedModel(id, agentId, loaded);
  }

  /**
   * A conversation with no stored model runs on the agent's default; start it on
   * the model this agent was last used with instead.
   */
  function applyRememberedModel(id: string, agentId: AgentId, loaded: LoadedSessionConfig) {
    if (loaded.modelValue) return;
    const remembered = modelPrefs.lastModelFor(agentId);
    if (!remembered) return;
    const option = loaded.config?.configOptions.find(isModelOption);
    if (option?.type !== "select" || option.currentValue === remembered) return;
    if (!flattenSelectValues(option).some((value) => value.id === remembered)) return;
    void sessionConfig.setOption(id, "model", remembered);
  }

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

  function handleConfigChange(configId: string, value: string) {
    if (configId === "model") modelPrefs.rememberModel(data.conversation.agent_id, value);
    void sessionConfig.setOption(conversationId, configId, value);
  }

  async function handleBranch() {
    const { data: created, error } = await api.api
      .conversations({ id: conversationId })
      .branch.post();
    if (error || !created || "error" in created) {
      chat.setError("Failed to branch conversation");
      return;
    }
    await goto(`/chat/${created.id}`);
  }

  async function handleSendMessage(text: string, files?: File[], mediaIds?: string[]) {
    if (!text.trim() && (!files || files.length === 0) && (!mediaIds || mediaIds.length === 0))
      return false;
    chat.setError(null);

    const attachments = await uploadAttachments(conversationId, files, mediaIds);
    if (!attachments) return false;

    const succeeded = await chat.send(
      conversationId,
      { text, attachments },
      (title) => (liveTitle = title),
    );
    if (succeeded) {
      await loadFiles();
    }
    return succeeded;
  }

  async function handleCommand(name: string) {
    chat.setError(null);
    const succeeded = await chat.runCommand(
      conversationId,
      name,
      undefined,
      (title) => (liveTitle = title),
    );
    if (succeeded) await loadFiles();
  }

  function handlePermissionReply(requestId: string, optionId: string) {
    chat.removePendingRequest(requestId);
    void api.api
      .conversations({ id: conversationId })
      .requests({ requestId })
      .permission.post({ optionId });
  }

  function handleElicitationReply(
    requestId: string,
    action: ElicitationReply["action"],
    content?: Record<string, unknown>,
  ) {
    chat.removePendingRequest(requestId);
    void api.api
      .conversations({ id: conversationId })
      .requests({ requestId })
      .elicitation.post({ action, content });
  }
</script>

<div class="flex h-full">
  <div class="flex min-w-0 flex-1 flex-col">
    <header class="flex h-12 shrink-0 items-center px-4 max-md:pl-14">
      {#key headerTitle}
        <h1 class="t-rise min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
          {headerTitle}
        </h1>
      {/key}
      {#if config?.capabilities.fork}
        <Tooltip.Root>
          <Tooltip.Trigger
            onclick={handleBranch}
            class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Branch conversation"
          >
            <GitBranchIcon size={15} />
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom">Branch conversation</Tooltip.Content>
        </Tooltip.Root>
      {/if}
    </header>

    {#if chat.isStreamingFor(conversationId)}
      <PlanRail entries={chat.planFor(conversationId)} />
    {/if}

    <MessageList
      messages={visibleMessages}
      isStreaming={chat.isStreamingFor(conversationId)}
    />

    {#if chat.lastError}
      <div
        class="mx-auto w-full max-w-[52rem] px-4"
        transition:slide={{ duration: 240, easing: cubicOut }}
      >
        <div class="mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span class="min-w-0 truncate">{chat.lastError}</span>
          <button
            type="button"
            class="shrink-0 font-medium hover:underline"
            onclick={() => {
              chat.setError(null);
              composer?.requestSubmit();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    {/if}

    <div class="px-4 pb-4">
      <div class="mx-auto w-full max-w-[52rem]">
        <MessageInput
          bind:this={composer}
          {config}
          modelInfo={sessionConfig.modelInfo}
          contextUsed={usage?.used ?? 0}
          contextSize={usage?.size ?? 0}
          onConfigChange={handleConfigChange}
          onModeChange={(modeId) => void sessionConfig.setMode(conversationId, modeId)}
          {commands}
          onCommand={handleCommand}
          onSubmit={handleSendMessage}
          isStreaming={chat.isStreamingFor(conversationId)}
          onStop={() => chat.stop(conversationId)}
          placeholder="Reply…"
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

<RequestDialog
  request={currentRequest}
  onPermission={handlePermissionReply}
  onElicitation={handleElicitationReply}
/>
