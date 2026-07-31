import { error } from "@sveltejs/kit";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { conversation } from "$lib/server/db/schema/kepler";
import { isEnoent, lookupMimeType, resolveExistingSafeFilePath, statOrNull } from "$lib/server/files";
import { getConversationInputPath, getConversationRoot } from "$lib/server/paths";
import type { RequestHandler } from "./$types";

/**
 * Attachments behind a shared transcript, reachable only through the token.
 * Without this the cards and media on a shared page render controls that
 * answer 401, which is worse than not showing them at all.
 */
export const GET: RequestHandler = async ({ params, url }) => {
  const conv = await db.query.conversation.findFirst({
    where: eq(conversation.share_token, params.token),
  });
  if (!conv) throw error(404, "This link is not valid");
  if (!params.path) throw error(400, "File path is required");

  const base =
    url.searchParams.get("scope") === "input"
      ? getConversationInputPath(conv)
      : getConversationRoot(conv);

  let absolutePath: string;
  try {
    absolutePath = await resolveExistingSafeFilePath(base, params.path);
  } catch (err) {
    throw error(isEnoent(err) ? 404 : 400, "File not found");
  }
  if (!(await statOrNull(absolutePath))?.isFile()) throw error(404, "File not found");

  return new Response(await readFile(absolutePath), {
    headers: {
      "Content-Type": lookupMimeType(absolutePath) ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${basename(params.path).replace(/"/g, "")}"`,
    },
  });
};
