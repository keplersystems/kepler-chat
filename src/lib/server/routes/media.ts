import { Elysia, t } from "elysia";
import { readFile } from "node:fs/promises";
import { requireAuth } from "$lib/server/auth";
import {
  deleteMedia,
  getMediaFilePath,
  listMedia,
  requireMedia,
  saveToLibrary,
  type MediaRow,
} from "$lib/server/media";

function toMediaDTO(row: MediaRow) {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type ?? undefined,
    size: row.size,
    createdAt: row.created_at,
  };
}

export const mediaRoute = new Elysia({ prefix: "/api/media" })
  .get(
    "/",
    async (context) => {
      requireAuth(context);
      const rows = await listMedia();
      return { media: rows.map(toMediaDTO) };
    },
    {
      detail: {
        summary: "List media library",
        tags: ["Media"],
        description: "All attachments in the library, newest first",
      },
    },
  )
  .post(
    "/",
    async (context) => {
      requireAuth(context);
      const { file } = context.body;
      const row = await saveToLibrary(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        file.type || undefined,
      );
      return { media: toMediaDTO(row) };
    },
    {
      body: t.Object({ file: t.File() }),
      detail: {
        summary: "Upload to library",
        tags: ["Media"],
        description: "Store a file in the media library, deduplicated by content",
      },
    },
  )
  .get(
    "/:id/raw",
    async (context) => {
      requireAuth(context);
      const row = await requireMedia(context.params.id);
      const target = await readFile(getMediaFilePath(row));
      const disposition = context.query.disposition === "attachment" ? "attachment" : "inline";
      return new Response(target, {
        headers: {
          "Content-Type": row.mime_type ?? "application/octet-stream",
          "Content-Disposition": `${disposition}; filename="${row.filename.replace(/"/g, "")}"`,
        },
      });
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        disposition: t.Optional(t.Union([t.Literal("inline"), t.Literal("attachment")])),
      }),
      detail: {
        summary: "Serve media file",
        tags: ["Media"],
        description: "Raw file contents, inline by default",
      },
    },
  )
  .delete(
    "/:id",
    async (context) => {
      requireAuth(context);
      await deleteMedia(context.params.id);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete media",
        tags: ["Media"],
        description:
          "Remove a file from the library; conversations that attached it keep their copies",
      },
    },
  );
