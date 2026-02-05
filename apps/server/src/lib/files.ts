import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, normalize, relative, resolve, sep } from "node:path";
import { env } from "@kepler-chat/env/server";
import type { FileEntryDTO } from "@kepler-chat/contracts";

const INVALID_FILENAME = /[<>:"/\\|?*\x00-\x1f]/g;

function assertSubpath(basePath: string, targetPath: string): void {
  if (targetPath === basePath) {
    return;
  }

  if (!targetPath.startsWith(`${basePath}${sep}`)) {
    throw new Error("Invalid file path");
  }
}

export function getUserBasePath(userId: string): string {
  return resolve(env.KEPLER_SESSIONS_PATH, userId);
}

export function getUserInputPath(userId: string): string {
  return resolve(getUserBasePath(userId), "input");
}

export function getUserOutputPath(userId: string): string {
  return resolve(getUserBasePath(userId), "output");
}

export function sanitizeFilename(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Filename cannot be empty");
  }

  const fileName = basename(trimmed).replace(INVALID_FILENAME, "_");
  if (!fileName || fileName === "." || fileName === "..") {
    throw new Error("Invalid filename");
  }
  return fileName;
}

export async function ensureUserFileDirs(userId: string): Promise<void> {
  await Promise.all([
    mkdir(getUserInputPath(userId), { recursive: true }),
    mkdir(getUserOutputPath(userId), { recursive: true }),
  ]);
}

export function resolveSafeFilePath(
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

export async function resolveAvailableFilePath(
  dir: string,
  fileName: string,
): Promise<{ absolutePath: string; relativePath: string }> {
  const safeName = sanitizeFilename(fileName);
  const baseDot = safeName.lastIndexOf(".");
  const hasExt = baseDot > 0;
  const base = hasExt ? safeName.slice(0, baseDot) : safeName;
  const ext = hasExt ? safeName.slice(baseDot) : "";

  let index = 0;
  while (true) {
    const candidate = index === 0 ? `${base}${ext}` : `${base}-${index}${ext}`;
    const absolutePath = resolve(dir, candidate);

    try {
      await stat(absolutePath);
      index += 1;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { absolutePath, relativePath: candidate };
      }
      throw error;
    }
  }
}

export async function statOrNull(path: string) {
  try {
    return await stat(path);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function listFilesRecursive(
  rootPath: string,
  startPath: string,
): Promise<FileEntryDTO[]> {
  const entries: FileEntryDTO[] = [];

  async function walk(currentPath: string): Promise<void> {
    const dirEntries = await readdir(currentPath, { withFileTypes: true });

    for (const dirEntry of dirEntries) {
      const absolutePath = resolve(currentPath, dirEntry.name);
      const stats = await stat(absolutePath);
      const relPath = relative(rootPath, absolutePath);

      entries.push({
        path: relPath,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        isDir: dirEntry.isDirectory(),
      });

      if (dirEntry.isDirectory()) {
        await walk(absolutePath);
      }
    }
  }

  await walk(startPath);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
