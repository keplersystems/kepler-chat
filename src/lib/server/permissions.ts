import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PermissionSettings } from "$lib/contracts";
import { getSessionsRoot } from "$lib/server/paths";
import { isEnoent } from "$lib/server/files";

export const PERMISSION_DEFAULTS: PermissionSettings = {
  bash: "allow",
  edit: "allow",
  webfetch: "ask",
  websearch: "ask",
  codesearch: "ask",
  external_directory: "deny",
};

function settingsPath(): string {
  return resolve(getSessionsRoot(), "permissions.json");
}

export async function readPermissionSettings(): Promise<PermissionSettings> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    return { ...PERMISSION_DEFAULTS, ...(JSON.parse(raw) as Partial<PermissionSettings>) };
  } catch (error) {
    if (isEnoent(error)) return { ...PERMISSION_DEFAULTS };
    throw error;
  }
}

export async function writePermissionSettings(settings: PermissionSettings): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2) + "\n");
}
