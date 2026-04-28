import { fail, redirect } from "@sveltejs/kit";
import { clearSessionCookie } from "$lib/server/auth";
import { createConversation, deleteConversation } from "$lib/server/conversations";
import type { Actions } from "./$types";

export const actions: Actions = {
  create: async ({ request }) => {
    const title = (await request.formData()).get("title");
    if (typeof title !== "string" || title.trim().length === 0) {
      return fail(400, { error: "Title required" });
    }
    const created = await createConversation(title.trim());
    throw redirect(303, `/chat/${created.id}`);
  },

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
