import { error } from "@sveltejs/kit";
import { serverApi } from "$lib/api";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ fetch, url }) => {
  const api = serverApi(fetch, url.origin);
  const [conversationsRes, projectsRes] = await Promise.all([
    api.api.conversations.get(),
    api.api.projects.get(),
  ]);
  if (conversationsRes.error || !conversationsRes.data) {
    throw error(500, "Failed to load conversations");
  }
  if (projectsRes.error || !projectsRes.data) {
    throw error(500, "Failed to load projects");
  }
  return {
    conversations: conversationsRes.data,
    projects: projectsRes.data,
  };
};
