import { serverApi } from "$lib/api";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ fetch, url }) => {
  const api = serverApi(fetch, url.origin);
  const [{ data: conversations }, { data: projects }] = await Promise.all([
    api.api.conversations.get(),
    api.api.projects.get(),
  ]);
  return {
    conversations: conversations ?? [],
    projects: projects ?? [],
  };
};
