import { api, apiErrorMessage } from "$lib/api";
import { chat } from "$lib/state/chat.svelte";
import type { SendMessageInput } from "$lib/contracts";

export type AttachmentInput = NonNullable<SendMessageInput["attachments"]>[number];

/**
 * Upload files and hardlink library media into a conversation's input
 * directory. Returns the send-API attachment list, or null after surfacing
 * the failure via the chat store.
 */
export async function uploadAttachments(
  conversationId: string,
  files: File[] = [],
  mediaIds: string[] = [],
): Promise<AttachmentInput[] | null> {
  const attachments: AttachmentInput[] = [];

  for (const file of files) {
    const { data: uploaded, error } = await api.api
      .conversations({ id: conversationId })
      .files.upload.post({ file });
    if (error || !uploaded || "error" in uploaded) {
      chat.setError(apiErrorMessage(error?.value, "Failed to upload file"));
      return null;
    }
    attachments.push({
      path: uploaded.file.path,
      mimeType: uploaded.file.mimeType,
      filename: file.name,
    });
  }

  for (const mediaId of mediaIds) {
    const { data: linked, error } = await api.api
      .conversations({ id: conversationId })
      .files["from-library"].post({ mediaId });
    if (error || !linked || "error" in linked) {
      chat.setError(apiErrorMessage(error?.value, "Failed to attach from library"));
      return null;
    }
    attachments.push(linked.file);
  }

  return attachments;
}
