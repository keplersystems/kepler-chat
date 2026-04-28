import { Elysia, t } from "elysia";
import { readFile, writeFile } from "node:fs/promises";
import { requireConversation } from "$lib/server/conversations";
import type {
  FileScope,
  ListOutputFilesResponse,
  UploadFileResponse,
} from "$lib/contracts";
import {
  listFilesRecursive,
  lookupMimeType,
  resolveAvailableFilePath,
  resolveExistingSafeFilePath,
  resolveSafeFilePath,
  statOrNull,
} from "$lib/server/files";
import {
  getConversationInputPath,
  getConversationOutputPath,
  provisionConversationDirectories,
} from "$lib/server/paths";
import { requireAuth } from "$lib/server/auth";
import { basename } from "node:path";

function getConversationScopePath(
  conversationId: string,
  scope: FileScope,
): string {
  return scope === "input"
    ? getConversationInputPath(conversationId)
    : getConversationOutputPath(conversationId);
}

export const filesRoute = new Elysia({ prefix: "/api/conversations" })
  .post(
    "/:id/files/upload",
    async (context): Promise<UploadFileResponse | { error: string }> => {
      requireAuth(context);
      const { id } = context.params;
      const { file } = context.body;

      await requireConversation(id);

      await provisionConversationDirectories(id);
      if (!(file instanceof File)) {
        context.set.status = 400;
        return { error: "Missing file upload" };
      }

      const inputPath = getConversationInputPath(id);
      const { absolutePath, relativePath } = await resolveAvailableFilePath(
        inputPath,
        file.name,
      );

      await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));
      return {
        success: true,
        file: {
          path: relativePath,
          size: file.size,
          mimeType: file.type || undefined,
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
  .get(
    "/:id/files/output",
    async (context): Promise<ListOutputFilesResponse | { error: string }> => {
      requireAuth(context);
      const { id } = context.params;
      const { prefix } = context.query;

      await requireConversation(id);

      await provisionConversationDirectories(id);
      const outputPath = getConversationOutputPath(id);

      let startPath = outputPath;
      if (prefix) {
        try {
          startPath = resolveSafeFilePath(outputPath, prefix);
        } catch {
          context.set.status = 400;
          return { error: "Invalid prefix" };
        }
      }

      const startStats = await statOrNull(startPath);
      if (!startStats) {
        context.set.status = 404;
        return { error: "Output path not found" };
      }
      if (!startStats.isDirectory()) {
        context.set.status = 400;
        return { error: "Prefix must point to a directory" };
      }

      const files = await listFilesRecursive(outputPath, startPath);
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
    async (context): Promise<Response | { error: string }> => {
      requireAuth(context);
      const { id } = context.params;
      const filePath = (context.params as { id: string; "*": string })["*"];
      const { scope } = context.query;

      await requireConversation(id);

      if (!filePath || filePath.trim().length === 0) {
        context.set.status = 400;
        return { error: "File path is required" };
      }

      const fileScope: FileScope = scope ?? "output";
      const basePath = getConversationScopePath(id, fileScope);

      let absolutePath: string;
      try {
        absolutePath = await resolveExistingSafeFilePath(basePath, filePath);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          context.set.status = 404;
          return { error: "File not found" };
        }
        context.set.status = 400;
        return { error: "Invalid file path" };
      }

      const fileStats = await statOrNull(absolutePath);
      if (!fileStats) {
        context.set.status = 404;
        return { error: "File not found" };
      }
      if (!fileStats.isFile()) {
        context.set.status = 400;
        return { error: "Path does not reference a file" };
      }

      const target = await readFile(absolutePath);
      const downloadName = basename(filePath).replace(/"/g, "");

      return new Response(target, {
        headers: {
          "Content-Type": lookupMimeType(absolutePath) ?? "application/octet-stream",
          "Content-Disposition": `attachment; filename=\"${downloadName}\"`,
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
      }),
      detail: {
        summary: "Download file",
        tags: ["Files"],
        description:
          "Download a file from input or output scope for a conversation",
      },
    },
  );
