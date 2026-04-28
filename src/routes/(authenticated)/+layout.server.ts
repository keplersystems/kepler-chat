import { serverApi } from "$lib/api";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ fetch, url }) => {
  const api = serverApi(fetch, url.origin);
  const { data: conversations } = await api.api.conversations.get();
  return {
    conversations: conversations ?? [],
  };
};
