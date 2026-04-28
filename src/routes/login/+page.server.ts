import { fail, redirect } from "@sveltejs/kit";
import { setSessionCookie, verifyPasscode } from "$lib/server/auth";
import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const passcode = (await request.formData()).get("passcode");
    if (typeof passcode !== "string" || !verifyPasscode(passcode)) {
      return fail(401, { error: "Invalid passcode" });
    }
    setSessionCookie(cookies);
    throw redirect(302, "/chat");
  },
};
