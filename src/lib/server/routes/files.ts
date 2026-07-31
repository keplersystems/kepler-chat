import { Elysia, t } from "elysia";
import { readFile } from "node:fs/promises";
import { requireConversation } from "$lib/server/conversations";
import type {
  FileScope,
  ListOutputFilesResponse,
  UploadFileResponse,
} from "$lib/contracts";
import {
  isEnoent,
  listFilesRecursive,
  lookupMimeType,
  resolveExistingSafeFilePath,
  resolveSafeFilePath,
  statOrNull,
} from "$lib/server/files";
import { HttpError } from "$lib/server/http-error";
import {
  getConversationInputPath,
  getConversationRoot,
  provisionConversationDirectories,
  type ConversationLocator,
} from "$lib/server/paths";
import { requireAuth } from "$lib/server/auth";
import { linkMediaIntoConversation, saveToLibrary } from "$lib/server/media";
import { basename } from "node:path";

/** Agent-facing plumbing materialized into every conversation root. */
const RUNTIME_ENTRIES = new Set([
  "input",
  "scratchpad",
  "AGENTS.md",
  "CLAUDE.md",
  ".opencode",
  ".claude",
]);

function getConversationScopePath(
  conversation: ConversationLocator,
  scope: FileScope,
): string {
  return scope === "input"
    ? getConversationInputPath(conversation)
    : getConversationRoot(conversation);
}

export const filesRoute = new Elysia({ prefix: "/api/conversations" })
  .post(
    "/:id/files/upload",
    async (context): Promise<UploadFileResponse> => {
      requireAuth(context);
      const { id } = context.params;
      const { file } = context.body;

      const conv = await requireConversation(id);

      await provisionConversationDirectories(conv);

      // Every upload lands in the media library (deduplicated) and is
      // hardlinked into the conversation, so reuse costs no space.
      const row = await saveToLibrary(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        file.type || undefined,
      );
      const linked = await linkMediaIntoConversation(row.id, conv);
      return {
        success: true,
        file: {
          path: linked.path,
          size: row.size,
          mimeType: linked.mimeType,
        },
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        file: t.File(),
      }),
      detail: {
        summary: "Upload file",
        tags: ["Files"],
        description:
          "Upload a file to the conversation's input directory",
      },
    },
  )
  .post(
    "/:id/files/from-library",
    async (context) => {
      requireAuth(context);
      const conv = await requireConversation(context.params.id);
      const linked = await linkMediaIntoConversation(context.body.mediaId, conv);
      return { success: true, file: linked };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ mediaId: t.String({ minLength: 1 }) }),
      detail: {
        summary: "Attach library media",
        tags: ["Files"],
        description: "Hardlink a media library file into the conversation's input directory",
      },
    },
  )
  .get(
    "/:id/files/output",
    async (context): Promise<ListOutputFilesResponse> => {
      requireAuth(context);
      const { id } = context.params;
      const { prefix } = context.query;

      const conv = await requireConversation(id);

      await provisionConversationDirectories(conv);
      // The whole working directory is the agent's visible output; input/
      // holds the user's own uploads.
      const workdirPath = getConversationRoot(conv);

      let startPath = workdirPath;
      if (prefix) {
        try {
          startPath = resolveSafeFilePath(workdirPath, prefix);
        } catch {
          throw new HttpError(400, "Invalid prefix");
        }
      }

      const startStats = await statOrNull(startPath);
      if (!startStats) {
        throw new HttpError(404, "Output path not found");
      }
      if (!startStats.isDirectory()) {
        throw new HttpError(400, "Prefix must point to a directory");
      }

      const files = await listFilesRecursive(workdirPath, startPath, RUNTIME_ENTRIES);
      return { files };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      query: t.Object({
        prefix: t.Optional(t.String()),
      }),
      detail: {
        summary: "List output files",
        tags: ["Files"],
        description:
          "Recursively list files under the conversation's output directory",
      },
    },
  )
  .get(
    "/:id/files/*",
    async (context): Promise<Response> => {
      requireAuth(context);
      const { id } = context.params;
      const filePath = (context.params as { id: string; "*": string })["*"];
      const { scope } = context.query;

      const conv = await requireConversation(id);

      if (!filePath || filePath.trim().length === 0) {
        throw new HttpError(400, "File path is required");
      }

      const fileScope: FileScope = scope ?? "output";
      const basePath = getConversationScopePath(conv, fileScope);

      let absolutePath: string;
      try {
        absolutePath = await resolveExistingSafeFilePath(basePath, filePath);
      } catch (error) {
        if (isEnoent(error)) throw new HttpError(404, "File not found");
        throw new HttpError(400, "Invalid file path");
      }

      const fileStats = await statOrNull(absolutePath);
      if (!fileStats) {
        throw new HttpError(404, "File not found");
      }
      if (!fileStats.isFile()) {
        throw new HttpError(400, "Path does not reference a file");
      }

      const target = await readFile(absolutePath);
      const downloadName = basename(filePath).replace(/"/g, "");
      const disposition = context.query.disposition === "inline" ? "inline" : "attachment";

      return new Response(target, {
        headers: {
          "Content-Type": lookupMimeType(absolutePath) ?? "application/octet-stream",
          "Content-Disposition": `${disposition}; filename=\"${downloadName}\"`,
        },
      });
    },
    {
      params: t.Object({
        id: t.String(),
        "*": t.String(),
      }),
      query: t.Object({
        scope: t.Optional(t.Union([t.Literal("input"), t.Literal("output")])),
        disposition: t.Optional(t.Union([t.Literal("inline"), t.Literal("attachment")])),
      }),
      detail: {
        summary: "Download file",
        tags: ["Files"],
        description:
          "Download a file from input or output scope for a conversation",
      },
    },
  );
