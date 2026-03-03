import { Elysia, t } from "elysia";
import type {
  FileScope,
  ListOutputFilesResponse,
  UploadFileResponse,
} from "@kepler-chat/contracts";
import {
  listFilesRecursive,
  resolveAvailableFilePath,
  resolveSafeFilePath,
  statOrNull,
} from "../lib/files";
import {
  getConversationInputPath,
  getConversationOutputPath,
  provisionConversationDirectories,
} from "../lib/conversation-paths";
import { requireAuth } from "../middleware/auth";
import { requireConversationOwnership } from "../lib/conversation";
import { basename } from "node:path";

function getConversationScopePath(
  userId: string,
  conversationId: string,
  scope: FileScope,
): string {
  return scope === "input"
    ? getConversationInputPath(userId, conversationId)
    : getConversationOutputPath(userId, conversationId);
}

export const filesRoute = new Elysia({ prefix: "/api/conversations" })
  .post(
    "/:id/files/upload",
    async (context): Promise<UploadFileResponse | { error: string }> => {
      const userId = await requireAuth(context);
      const { id } = context.params;
      const { file } = context.body;

      const conversation = await requireConversationOwnership(id, userId);
      if (!conversation) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

      await provisionConversationDirectories(userId, id);
      if (!(file instanceof File)) {
        context.set.status = 400;
        return { error: "Missing file upload" };
      }

      const inputPath = getConversationInputPath(userId, id);
      const { absolutePath, relativePath } = await resolveAvailableFilePath(
        inputPath,
        file.name,
      );

      const bytes = await Bun.write(absolutePath, file);
      return {
        success: true,
        file: {
          path: relativePath,
          size: bytes,
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
      const userId = await requireAuth(context);
      const { id } = context.params;
      const { prefix } = context.query;

      const conversation = await requireConversationOwnership(id, userId);
      if (!conversation) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

      await provisionConversationDirectories(userId, id);
      const outputPath = getConversationOutputPath(userId, id);

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
      const userId = await requireAuth(context);
      const { id } = context.params;
      const filePath = (context.params as { id: string; "*": string })["*"];
      const { scope } = context.query;

      const conversation = await requireConversationOwnership(id, userId);
      if (!conversation) {
        context.set.status = 404;
        return { error: "Conversation not found" };
      }

      if (!filePath || filePath.trim().length === 0) {
        context.set.status = 400;
        return { error: "File path is required" };
      }

      const fileScope: FileScope = scope ?? "output";
      const basePath = getConversationScopePath(userId, id, fileScope);

      let absolutePath: string;
      try {
        absolutePath = resolveSafeFilePath(basePath, filePath);
      } catch {
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

      const target = Bun.file(absolutePath);
      const downloadName = basename(filePath).replace(/"/g, "");

      return new Response(target, {
        headers: {
          "Content-Type": target.type || "application/octet-stream",
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
          "Download a file from input or output scope for an owned conversation",
      },
    },
  );
