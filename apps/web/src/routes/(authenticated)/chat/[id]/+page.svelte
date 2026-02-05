<script lang="ts">
  import { createChatState } from "$lib/state/chat.svelte";
  import type { MessageView } from "$lib/state/chat-types";
  import type { ConversationDTO, PendingRequestDTO } from "@kepler-chat/contracts";

  let { data } = $props<{
    data: {
      conversation: ConversationDTO;
      messages: unknown[];
      requests: PendingRequestDTO[];
    };
  }>();

  const state = createChatState();

  $effect(() => {
    state.setCurrentConversation(data.conversation.id);
    state.setMessages(data.conversation.id, data.messages as MessageView[]);
    state.setPendingRequests(data.requests);
  });
</script>
