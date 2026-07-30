import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, normalize, relative, resolve, sep } from "node:path";
import type { FileEntryDTO } from "$lib/contracts";

const INVALID_FILENAME = /[<>:"/\\|?*\x00-\x1f]/g;
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

function assertSubpath(basePath: string, targetPath: string): void {
  if (targetPath === basePath) {
    return;
  }

  if (!targetPath.startsWith(`${basePath}${sep}`)) {
    throw new Error("Invalid file path");
  }
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

export function resolveSafeFilePath(
  rootPath: string,
  requestedRelativePath: string,
): string {
  const rootAbsolute = resolve(rootPath);
  const normalized = normalize(requestedRelativePath);

  if (!normalized || normalized === ".") {
    throw new Error("File path is required");
  }
  if (normalized.startsWith("/") || normalized.startsWith("\\")) {
    throw new Error("Absolute paths are not allowed");
  }

  const absolute = resolve(rootAbsolute, normalized);
  assertSubpath(rootAbsolute, absolute);
  return absolute;
}

async function assertNoSymlinkComponents(
  rootPath: string,
  targetPath: string,
): Promise<void> {
  const rootAbsolute = resolve(rootPath);
  const targetAbsolute = resolve(targetPath);
  assertSubpath(rootAbsolute, targetAbsolute);

  const relativePath = relative(rootAbsolute, targetAbsolute);
  if (!relativePath) {
    return;
  }

  let currentPath = rootAbsolute;
  for (const segment of relativePath.split(sep)) {
    currentPath = resolve(currentPath, segment);
    const stats = await lstat(currentPath);
    if (stats.isSymbolicLink()) {
      throw new Error("Symlinks are not allowed");
    }
  }
}

export async function resolveExistingSafeFilePath(
  rootPath: string,
  requestedRelativePath: string,
): Promise<string> {
  const absolute = resolveSafeFilePath(rootPath, requestedRelativePath);
  await assertNoSymlinkComponents(rootPath, absolute);

  const [realRoot, realTarget] = await Promise.all([
    realpath(resolve(rootPath)),
    realpath(absolute),
  ]);
  assertSubpath(realRoot, realTarget);
  return realTarget;
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
      await lstat(absolutePath);
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

export function lookupMimeType(path: string): string | undefined {
  return MIME_TYPES[extname(path).toLowerCase()];
}

export async function listFilesRecursive(
  rootPath: string,
  startPath: string,
  excludeTopLevel: Set<string> = new Set(),
): Promise<FileEntryDTO[]> {
  const entries: FileEntryDTO[] = [];

  async function walk(currentPath: string): Promise<void> {
    const dirEntries = await readdir(currentPath, { withFileTypes: true });

    for (const dirEntry of dirEntries) {
      if (dirEntry.name.startsWith(".")) continue;
      const absolutePath = resolve(currentPath, dirEntry.name);
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        continue;
      }
      const relPath = relative(rootPath, absolutePath);
      if (excludeTopLevel.has(relPath)) continue;

      if (dirEntry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      entries.push({
        path: relPath,
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        isDir: false,
      });
    }
  }

  await walk(startPath);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
