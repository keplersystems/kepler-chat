import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.DATABASE_URL ??= "file:test.db";
process.env.KEPLER_PASSCODE ??= "test-passcode";
process.env.CORS_ORIGIN ??= "http://localhost:5173";
process.env.KEPLER_SESSIONS_PATH ??= "/tmp/kepler-test-sessions";
process.env.KEPLER_PROVIDER_CREDENTIALS_KEY ??= Buffer.alloc(32, 1).toString(
  "base64",
);

const {
  listFilesRecursive,
  resolveAvailableFilePath,
  resolveExistingSafeFilePath,
  resolveSafeFilePath,
  sanitizeFilename,
} = await import("./files");

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("files helper", () => {
  it("sanitizes and validates filenames", () => {
    expect(sanitizeFilename(" report.pdf ")).toBe("report.pdf");
    expect(sanitizeFilename("a<b>c.txt")).toBe("a_b_c.txt");
    expect(() => sanitizeFilename("   ")).toThrow("Filename cannot be empty");
    expect(() => sanitizeFilename("..")).toThrow("Invalid filename");
  });

  it("blocks path traversal in safe path resolver", () => {
    const root = "/tmp/kepler-safe-root";
    expect(resolveSafeFilePath(root, "nested/file.txt")).toBe(
      "/tmp/kepler-safe-root/nested/file.txt",
    );
    expect(() => resolveSafeFilePath(root, "../etc/passwd")).toThrow("Invalid file path");
    expect(() => resolveSafeFilePath(root, "/etc/passwd")).toThrow(
      "Absolute paths are not allowed",
    );
  });

  it("rejects symlinks when resolving existing files", async () => {
    const root = await mkdtemp(join(tmpdir(), "kepler-symlink-"));
    cleanupPaths.push(root);

    await writeFile(join(root, "safe.txt"), "safe");
    await symlink(join(root, "safe.txt"), join(root, "link.txt"));

    await expect(resolveExistingSafeFilePath(root, "safe.txt")).resolves.toBe(
      join(root, "safe.txt"),
    );
    await expect(resolveExistingSafeFilePath(root, "link.txt")).rejects.toThrow(
      "Symlinks are not allowed",
    );
  });

  it("allocates non-colliding file names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kepler-files-"));
    cleanupPaths.push(dir);

    await writeFile(join(dir, "report.txt"), "v1");
    await writeFile(join(dir, "report-1.txt"), "v2");

    const next = await resolveAvailableFilePath(dir, "report.txt");
    expect(next.relativePath).toBe("report-2.txt");
    expect(next.absolutePath).toBe(join(dir, "report-2.txt"));
  });

  it("lists files recursively with deterministic ordering", async () => {
    const root = await mkdtemp(join(tmpdir(), "kepler-list-"));
    cleanupPaths.push(root);

    await mkdir(join(root, "a", "b"), { recursive: true });
    await writeFile(join(root, "z.txt"), "z");
    await writeFile(join(root, "a", "b", "x.txt"), "x");

    const entries = await listFilesRecursive(root, root);
    const paths = entries.map((entry) => entry.path);

    expect(paths).toEqual(["a", "a/b", "a/b/x.txt", "z.txt"]);

    const file = entries.find((entry) => entry.path === "a/b/x.txt");
    expect(file?.isDir).toBe(false);
    expect(file?.size).toBe(1);
    expect(typeof file?.mtime).toBe("string");

    const dir = entries.find((entry) => entry.path === "a/b");
    expect(dir?.isDir).toBe(true);
  });

  it("does not list symlink entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "kepler-list-symlink-"));
    cleanupPaths.push(root);

    await writeFile(join(root, "target.txt"), "target");
    await symlink(join(root, "target.txt"), join(root, "target-link.txt"));

    const entries = await listFilesRecursive(root, root);

    expect(entries.map((entry) => entry.path)).toEqual(["target.txt"]);
  });
});
