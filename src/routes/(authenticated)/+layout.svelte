<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import type { ConversationDTO, ProjectDTO } from "$lib/contracts";
  import ChatLayout from "$lib/components/chat/ChatLayout.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";

  interface Props {
    children: Snippet;
    data: { conversations: ConversationDTO[]; projects: ProjectDTO[] };
  }

  const { children, data }: Props = $props();

  const currentConversationId = $derived(
    page.route.id === "/(authenticated)/chat/[id]" ? (page.params.id ?? null) : null,
  );
</script>

<ChatLayout conversations={data.conversations} {currentConversationId}>
  {@render children()}
</ChatLayout>

<CommandPalette conversations={data.conversations} projects={data.projects} />
