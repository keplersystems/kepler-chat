<script lang="ts">
  import { createChatState } from "$lib/state/chat.svelte";
  import type { MessageView } from "$lib/state/chat-types";
  import type { ConversationDTO, PendingRequestDTO } from "@kepler-chat/contracts";
  import { api, streamMessage } from "$lib/api/chat";
  import { authClient } from "$lib/auth-client";
  import ChatLayout from "../../../../components/chat/ChatLayout.svelte";
  import MessageList from "../../../../components/chat/MessageList.svelte";
  import MessageInput from "../../../../components/chat/MessageInput.svelte";
  import RequestDialog from "../../../../components/chat/RequestDialog.svelte";
  import FilePanel from "../../../../components/chat/FilePanel.svelte";
  import Tooltip from "../../../../components/ui/Tooltip.svelte";

  let { data } = $props<{
    data: {
      conversations: ConversationDTO[];
      conversation: ConversationDTO;
      messages: unknown[];
      requests: PendingRequestDTO[];
    };
  }>();

  const session = authClient.useSession();
  const chatState = createChatState();
  let conversations = $state<ConversationDTO[]>([]);
  let conversationTitle = $state("");
  let isFilesPanelCollapsed = $state(false);
  const FILE_PANEL_STORAGE_PREFIX = "kepler:chat:files-panel-collapsed:";

  // Local state for files
  let outputFiles: { path: string; size: number; mtime: string; isDir: boolean }[] = $state([]);

  function toMessageViewList(rawMessages: unknown[]): MessageView[] {
    return rawMessages
      .map((raw): MessageView | null => {
        if (!raw || typeof raw !== "object") return null;
        const message = raw as {
          info?: { id?: string; role?: string };
          parts?: Array<{ type?: string; text?: string }>;
        };

        const id = message.info?.id;
        const role = message.info?.role;
        if (!id || (role !== "user" && role !== "assistant" && role !== "system")) {
          return null;
        }

        const text = (message.parts ?? [])
          .filter((part) => part?.type === "text" && typeof part.text === "string")
          .map((part) => part.text)
          .join("");

        if ((role === "assistant" || role === "system") && text.trim().length === 0) {
          return null;
        }

        return { id, role, text };
      })
      .filter((message): message is MessageView => message !== null);
  }

  $effect(() => {
    conversations = data.conversations;
    conversationTitle = data.conversation.title;
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(
        `${FILE_PANEL_STORAGE_PREFIX}${data.conversation.id}`,
      );
      isFilesPanelCollapsed = stored === "true";
    }
    chatState.setCurrentConversation(data.conversation.id);
    chatState.setMessages(data.conversation.id, toMessageViewList(data.messages));
    chatState.setPendingRequests(data.requests);
    loadFiles();
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `${FILE_PANEL_STORAGE_PREFIX}${data.conversation.id}`,
      String(isFilesPanelCollapsed),
    );
  });

  function applyConversationTitle(nextTitle: string) {
    const title = nextTitle.trim();
    if (!title) return;

    conversationTitle = title;
    conversations = conversations.map((conversation) =>
      conversation.id === data.conversation.id
        ? { ...conversation, title }
        : conversation,
    );
  }

  function getPendingRequestId(request: PendingRequestDTO): string | null {
    const payload = request.request as { id?: unknown; requestID?: unknown; requestId?: unknown };
    if (typeof payload?.id === "string" && payload.id.length > 0) return payload.id;
    if (typeof payload?.requestID === "string" && payload.requestID.length > 0) return payload.requestID;
    if (typeof payload?.requestId === "string" && payload.requestId.length > 0) return payload.requestId;
    return null;
  }

  async function loadFiles() {
    try {
      const response = await api.listOutputFiles(data.conversation.id);
      outputFiles = response.files;
      if (outputFiles.length === 0) {
        isFilesPanelCollapsed = false;
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  }

  async function handleSendMessage(text: string, files?: File[]) {
    if (!text.trim() && (!files || files.length === 0)) return;

    // Upload files first if any
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          await api.uploadFile(data.conversation.id, file);
        } catch (err) {
          console.error('Failed to upload file:', err);
        }
      }
    }

    // Add user message locally
    const userMessage: MessageView = {
      id: crypto.randomUUID(),
      role: "user",
      text: text + (files && files.length > 0 ? `\n\n[Attached ${files.length} file(s)]` : "")
    };
    chatState.upsertMessage(data.conversation.id, userMessage);
    chatState.setStreaming(true);

    // Stream assistant response
    try {
      await streamMessage(
        data.conversation.id,
        { text },
        {
          onMessage: (msg) => {
            chatState.upsertMessage(data.conversation.id, msg as MessageView);
          },
          onDelta: (messageId, delta) => {
            chatState.appendDelta(data.conversation.id, messageId, delta);
          },
          onTitle: (title) => {
            applyConversationTitle(title);
          },
          onRequestAdded: (request) => {
            chatState.upsertPendingRequest(request);
          },
          onRequestResolved: (requestId) => {
            chatState.removePendingRequest(requestId);
          },
          onError: (err) => {
            chatState.setError(err.message);
            chatState.setStreaming(false);
          },
          onComplete: () => {
            chatState.setStreaming(false);
            loadFiles(); // Refresh files after completion
          }
        }
      );
    } catch (err) {
      chatState.setError(err instanceof Error ? err.message : 'Failed to send message');
      chatState.setStreaming(false);
    }
  }

  async function handleRequestReply(reply: { reply?: string; answers?: string[][] }) {
    const request = chatState.pendingRequests[0];
    if (!request) return;
    const requestId = getPendingRequestId(request);
    if (!requestId) {
      chatState.setError("Request id missing");
      return;
    }

    try {
      if (request.type === 'permission' && reply.reply) {
        await api.replyToPermissionRequest(data.conversation.id, requestId, { reply: reply.reply as 'once' | 'always' | 'reject' });
      } else if (request.type === 'question' && reply.answers) {
        await api.replyToQuestionRequest(data.conversation.id, requestId, { answers: reply.answers });
      }
      
      // Refresh requests
      const response = await api.listRequests(data.conversation.id);
      chatState.setPendingRequests(response.requests);
    } catch (err) {
      console.error('Failed to reply to request:', err);
    }
  }

  async function handleRequestReject() {
    const request = chatState.pendingRequests[0];
    if (!request) return;
    const requestId = getPendingRequestId(request);
    if (!requestId) {
      chatState.setError("Request id missing");
      return;
    }

    try {
      if (request.type === 'permission') {
        await api.replyToPermissionRequest(data.conversation.id, requestId, { reply: 'reject' });
      }
      
      // Refresh requests
      const response = await api.listRequests(data.conversation.id);
      chatState.setPendingRequests(response.requests);
    } catch (err) {
      console.error('Failed to reject request:', err);
    }
  }

  function getCurrentMessages(): MessageView[] {
    return chatState.messagesByConversation[data.conversation.id] || [];
  }

  const currentRequest = $derived(chatState.pendingRequests[0] || null);
</script>

<ChatLayout 
  {conversations}
  currentConversationId={data.conversation.id}
  user={$session.data?.user}
>
  <div class="flex h-full">
    <!-- Main Chat Area -->
    <div class="flex flex-1 flex-col min-w-0">
      <!-- Header -->
      <header class="flex h-14 items-center justify-between border-b px-4">
        <h1 class="truncate text-lg font-semibold">{conversationTitle}</h1>
        <div class="flex items-center gap-2">
          <Tooltip content="Refresh files">
            <button onclick={loadFiles} class="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label="Refresh files">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </header>

      <!-- Messages -->
      <MessageList 
        messages={getCurrentMessages()} 
        isStreaming={chatState.isStreaming}
      />

      <!-- Error Message -->
      {#if chatState.lastError}
        <div class="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {chatState.lastError}
        </div>
      {/if}

      <!-- Input -->
      <MessageInput 
        onSubmit={handleSendMessage}
        disabled={chatState.isStreaming}
        placeholder="Message..."
      />
    </div>

    <!-- Right Sidebar with Files -->
    {#if outputFiles.length > 0}
      <aside class="hidden border-l bg-sidebar lg:flex {isFilesPanelCollapsed ? 'w-12' : 'w-80'}">
        {#if isFilesPanelCollapsed}
          <div class="flex h-full w-full flex-col items-center pt-2">
            <Tooltip content="Expand files panel">
              <button
                onclick={() => (isFilesPanelCollapsed = false)}
                class="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent"
                aria-label="Expand files panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8l6 6Z" />
                  <path d="M14 2v6h6" />
                </svg>
              </button>
            </Tooltip>
          </div>
        {:else}
          <div class="flex h-full w-full min-w-0 flex-col">
            <div class="flex h-12 items-center justify-between border-b px-3">
              <span class="text-sm font-semibold text-sidebar-foreground">
                Generated Files ({outputFiles.length})
              </span>
              <div class="flex items-center gap-1">
                <Tooltip content="Refresh files">
                  <button
                    onclick={loadFiles}
                    class="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    aria-label="Refresh files panel"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                      <path d="M8 16H3v5" />
                    </svg>
                  </button>
                </Tooltip>
                <Tooltip content="Collapse files panel">
                  <button
                    onclick={() => (isFilesPanelCollapsed = true)}
                    class="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    aria-label="Collapse files panel"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8l6 6Z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
            <div class="min-h-0 flex-1">
              <FilePanel 
                conversationId={data.conversation.id}
                files={outputFiles}
              />
            </div>
          </div>
        {/if}
      </aside>
    {/if}
  </div>

  <!-- Request Dialog -->
  <RequestDialog
    request={currentRequest}
    onReply={handleRequestReply}
    onReject={handleRequestReject}
  />
</ChatLayout>
