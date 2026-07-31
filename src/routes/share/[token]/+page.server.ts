import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/kepler";
import { listMessages } from "$lib/server/messages";
import type { PageServerLoad } from "./$types";

/**
 * Read straight from the database rather than through the API: these requests
 * carry no session, and the token is the only thing that authorises them.
 */
export const load: PageServerLoad = async ({ params }) => {
  const row = await db.query.conversation.findFirst({
    where: eq(conversation.share_token, params.token),
  });
  if (!row) throw error(404, "This link is not valid");

  // Part urls point at the authenticated download route; a shared reader has no
  // session, so repoint them at the token-scoped one.
  const authed = `/api/conversations/${encodeURIComponent(row.id)}/files/`;
  const shared = `/share/${encodeURIComponent(params.token)}/files/`;
  const messages = (await listMessages(row.id)).map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "file" ? { ...part, url: part.url.replace(authed, shared) } : part,
    ),
  }));

  return { title: row.title, mode: row.mode, messages };
};
