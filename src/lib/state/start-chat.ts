import { goto } from "$app/navigation";
import { api } from "$lib/api";
import { chat } from "$lib/state/chat.svelte";
import { uploadAttachments } from "$lib/state/attachments";
import type { ModelSelection } from "$lib/types";

/** Create a conversation, kick off the first send, and navigate to it. */
export async function startChat(
  text: string,
  model: ModelSelection,
  files?: File[],
  projectId?: string,
  mediaIds?: string[],
  variant?: string,
): Promise<boolean> {
  const { data: created, error } = await api.api.conversations.post({
    title: "New Chat",
    ...(projectId ? { projectId } : {}),
  });
  if (error || !created || "error" in created) {
    chat.setError("Failed to create conversation");
    return false;
  }

  const attachments = await uploadAttachments(created.id, files, mediaIds);
  if (!attachments) return false;

  void chat.send(created.id, { text, model, attachments, variant });
  await goto(`/chat/${created.id}`, { invalidateAll: true });
  return true;
}
