import { goto } from "$app/navigation";
import { api } from "$lib/api";
import type { AgentId, ConversationMode } from "$lib/contracts";
import { chat } from "$lib/state/chat.svelte";
import { agentCatalog } from "$lib/state/agents.svelte";
import { modelPrefs } from "$lib/state/model-prefs.svelte";
import { uploadAttachments } from "$lib/state/attachments";

/** Create a conversation, kick off the first send, and navigate to it. */
export async function startChat(
  text: string,
  agentId: AgentId,
  mode: ConversationMode,
  files?: File[],
  projectId?: string,
  mediaIds?: string[],
  configOptions: Record<string, string> = {},
): Promise<boolean> {
  const { data: created, error } = await api.api.conversations.post({
    title: "New Chat",
    agentId,
    mode,
    ...(projectId ? { projectId } : {}),
    ...(Object.keys(configOptions).length > 0 ? { configOptions } : {}),
  });
  if (error || !created || "error" in created) {
    chat.setError("Failed to create conversation");
    return false;
  }

  const attachments = await uploadAttachments(created.id, files, mediaIds);
  if (!attachments) return false;

  agentCatalog.remember(agentId);
  if (configOptions.model) modelPrefs.rememberModel(agentId, configOptions.model);
  // Navigate before sending: chat.send's invalidateAll would otherwise cancel
  // the pending navigation. The conversation store is keyed by id, so the
  // mounted page renders the stream that starts right after.
  await goto(`/chat/${created.id}`);
  void chat.send(created.id, { text, attachments });
  return true;
}
