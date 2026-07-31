import { createHash } from "node:crypto";
import { copyFile, link, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { media } from "$lib/server/db/schema/kepler";
import { resolveAvailableFilePath, statOrNull } from "$lib/server/files";
import { HttpError } from "$lib/server/http-error";
import { generateId } from "$lib/server/ids";
import {
  getConversationInputPath,
  getSessionsRoot,
  provisionConversationDirectories,
  type ConversationLocator,
} from "$lib/server/paths";

export type MediaRow = typeof media.$inferSelect;

function getLibraryRoot(): string {
  return resolve(getSessionsRoot(), "library");
}

export function getMediaFilePath(row: MediaRow): string {
  return resolve(getLibraryRoot(), row.id, row.filename);
}

export async function requireMedia(id: string): Promise<MediaRow> {
  const row = await db.query.media.findFirst({ where: eq(media.id, id) });
  if (!row) throw new HttpError(404, "Media not found");
  return row;
}

export async function listMedia(): Promise<MediaRow[]> {
  return db.query.media.findMany({ orderBy: (m, { desc }) => [desc(m.created_at)] });
}

/** Store a file in the library, deduplicated by content hash. */
export async function saveToLibrary(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<MediaRow> {
  const hash = createHash("sha256").update(buffer).digest("hex");
  const existing = await db.query.media.findFirst({ where: eq(media.hash, hash) });
  if (existing) {
    // The row can outlive its bytes: the library lives under the sessions root,
    // which is commonly on tmpfs. Rewrite rather than hand back a reference
    // that would fail to link.
    const path = getMediaFilePath(existing);
    if (!(await statOrNull(path))) {
      await mkdir(resolve(getLibraryRoot(), existing.id), { recursive: true });
      await writeFile(path, buffer);
    }
    return existing;
  }

  const id = generateId();
  const safeName = basename(filename).trim() || "file";
  const dir = resolve(getLibraryRoot(), id);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, safeName), buffer);

  const [row] = await db
    .insert(media)
    .values({ id, hash, filename: safeName, mime_type: mimeType ?? null, size: buffer.byteLength })
    .returning();
  return row;
}

/**
 * Delete the library entry. Conversations that attached it keep their
 * hardlinked copies; only the library reference goes away.
 */
export async function deleteMedia(id: string): Promise<void> {
  const row = await requireMedia(id);
  await rm(resolve(getLibraryRoot(), row.id), { recursive: true, force: true });
  await db.delete(media).where(eq(media.id, row.id));
}

/**
 * Make a library file available in a conversation's input dir. Hardlinked so
 * reuse costs no space; falls back to a copy across filesystems.
 */
export async function linkMediaIntoConversation(
  id: string,
  conversation: ConversationLocator,
): Promise<{ path: string; mimeType?: string; filename: string }> {
  const row = await requireMedia(id);
  await provisionConversationDirectories(conversation);
  const inputPath = getConversationInputPath(conversation);
  const { absolutePath, relativePath } = await resolveAvailableFilePath(inputPath, row.filename);

  const source = getMediaFilePath(row);
  if (!(await statOrNull(source))) {
    throw new HttpError(410, `Library file is no longer on disk: ${row.filename}`);
  }
  try {
    await link(source, absolutePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await copyFile(source, absolutePath);
  }

  return {
    path: relativePath,
    mimeType: row.mime_type ?? undefined,
    filename: row.filename,
  };
}
