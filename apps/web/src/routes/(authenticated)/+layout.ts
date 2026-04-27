import { redirect } from "@sveltejs/kit";
import { authClient } from "$lib/auth-client";
import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async ({ fetch }) => {
  const session = await authClient.session(fetch);

  if (!session.authenticated) {
    throw redirect(302, "/login");
  }
};
