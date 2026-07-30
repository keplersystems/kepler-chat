import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PermissionSettings } from "$lib/contracts";
import { isEnoent } from "$lib/server/files";
import { getSessionsRoot } from "$lib/server/paths";

export const PERMISSION_DEFAULTS: PermissionSettings = {
  bash: "allow",
  edit: "allow",
  webfetch: "ask",
  websearch: "ask",
  codesearch: "ask",
  external_directory: "deny",
};

function permissionsPath(): string {
  return resolve(getSessionsRoot(), "permissions.json");
}

export async function readPermissionSettings(): Promise<PermissionSettings> {
  const raw = await readFile(permissionsPath(), "utf8").catch((err) => {
    if (isEnoent(err)) return null;
    throw err;
  });
  if (!raw) return { ...PERMISSION_DEFAULTS };
  const stored = JSON.parse(raw) as Partial<PermissionSettings>;
  return { ...PERMISSION_DEFAULTS, ...stored };
}

export async function writePermissionSettings(settings: PermissionSettings): Promise<void> {
  await writeFile(permissionsPath(), JSON.stringify(settings, null, 2) + "\n", "utf8");
}
