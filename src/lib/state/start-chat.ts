import { goto } from "$app/navigation";
import { api } from "$lib/api";
import { chat } from "$lib/state/chat.svelte";
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

  const attachments: Array<{ path: string; mimeType?: string; filename?: string }> = [];
  for (const file of files ?? []) {
    const { data: uploaded, error: uploadError } = await api.api
      .conversations({ id: created.id })
      .files.upload.post({ file });
    if (uploadError || !uploaded || "error" in uploaded) {
      chat.setError("Failed to upload file");
      return false;
    }
    attachments.push({
      path: uploaded.file.path,
      mimeType: uploaded.file.mimeType,
      filename: file.name,
    });
  }

  for (const mediaId of mediaIds ?? []) {
    const { data: linked, error: linkError } = await api.api
      .conversations({ id: created.id })
      .files["from-library"].post({ mediaId });
    if (linkError || !linked || "error" in linked) {
      chat.setError("Failed to attach from library");
      return false;
    }
    attachments.push(linked.file);
  }

  void chat.send(created.id, { text, model, attachments, variant });
  await goto(`/chat/${created.id}`, { invalidateAll: true });
  return true;
}
