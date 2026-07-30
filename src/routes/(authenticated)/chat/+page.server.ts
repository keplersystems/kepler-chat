import { fail, redirect } from "@sveltejs/kit";
import { clearSessionCookie } from "$lib/server/auth";
import { deleteConversation } from "$lib/server/conversations";
import type { Actions } from "./$types";

export const actions: Actions = {
  delete: async ({ request }) => {
    const id = (await request.formData()).get("id");
    if (typeof id !== "string" || id.length === 0) {
      return fail(400, { error: "Id required" });
    }
    await deleteConversation(id);
    throw redirect(303, "/chat");
  },

  logout: async ({ cookies }) => {
    clearSessionCookie(cookies);
    throw redirect(303, "/login");
  },
};
