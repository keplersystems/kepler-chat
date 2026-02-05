import type { PageLoad } from "./$types";
import { listConversations } from "$lib/api/chat";

export const load: PageLoad = async ({ fetch }) => {
  const conversations = await listConversations(fetch);

  return {
    conversations,
  };
};
