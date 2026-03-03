import { normalize, resolve, sep } from "node:path";
import { mkdir } from "node:fs/promises";
import { env } from "@kepler-chat/env/server";

function assertSubpath(basePath: string, targetPath: string): void {
  if (targetPath === basePath) return;
  if (!targetPath.startsWith(`${basePath}${sep}`)) {
    throw new Error("Path escapes conversation root");
  }
}

export function getConversationRoot(
  userId: string,
  conversationId: string,
): string {
  return resolve(
    env.KEPLER_SESSIONS_PATH,
    userId,
    "conversations",
    conversationId,
  );
}

export function getConversationInputPath(
  userId: string,
  conversationId: string,
): string {
  return resolve(getConversationRoot(userId, conversationId), "input");
}

export function getConversationOutputPath(
  userId: string,
  conversationId: string,
): string {
  return resolve(getConversationRoot(userId, conversationId), "output");
}

export function getConversationPlaygroundPath(
  userId: string,
  conversationId: string,
): string {
  return resolve(getConversationRoot(userId, conversationId), "playground");
}

export function getConversationOpencodePaths(
  userId: string,
  conversationId: string,
): {
  xdgData: string;
  xdgCache: string;
  xdgConfig: string;
  xdgState: string;
} {
  const opencodeRoot = resolve(
    getConversationRoot(userId, conversationId),
    ".opencode",
  );
  return {
    xdgData: resolve(opencodeRoot, "data"),
    xdgCache: resolve(opencodeRoot, "cache"),
    xdgConfig: resolve(opencodeRoot, "config"),
    xdgState: resolve(opencodeRoot, "state"),
  };
}

/**
 * Resolves a relative path safely within a conversation root.
 * Rejects absolute paths, traversals, and paths escaping the root.
 */
export function resolveSafeConversationPath(
  rootPath: string,
  requestedRelativePath: string,
): string {
  const normalized = normalize(requestedRelativePath);

  if (!normalized || normalized === ".") {
    throw new Error("File path is required");
  }
  if (normalized.startsWith("/") || normalized.startsWith("\\")) {
    throw new Error("Absolute paths are not allowed");
  }

  const absolute = resolve(rootPath, normalized);
  assertSubpath(rootPath, absolute);
  return absolute;
}

/**
 * Provisions all directories for a conversation.
 * Idempotent - safe to call multiple times.
 */
export async function provisionConversationDirectories(
  userId: string,
  conversationId: string,
): Promise<void> {
  const paths = getConversationOpencodePaths(userId, conversationId);
  await Promise.all([
    mkdir(getConversationInputPath(userId, conversationId), {
      recursive: true,
    }),
    mkdir(getConversationOutputPath(userId, conversationId), {
      recursive: true,
    }),
    mkdir(getConversationPlaygroundPath(userId, conversationId), {
      recursive: true,
    }),
    mkdir(paths.xdgData, { recursive: true }),
    mkdir(paths.xdgCache, { recursive: true }),
    mkdir(paths.xdgConfig, { recursive: true }),
    mkdir(paths.xdgState, { recursive: true }),
  ]);
}
