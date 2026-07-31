import { error } from "@sveltejs/kit";
import { serverApi } from "$lib/api";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { data, error: loadError } = await serverApi(fetch, url.origin)
    .api.conversations.shared.get();
  if (loadError || !data) throw error(500, "Failed to load shared conversations");
  return { shared: data.conversations };
};
