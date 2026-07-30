import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Config } from "@opencode-ai/sdk/v2";
import { isEnoent } from "$lib/server/files";
import { getGlobalOpencodeConfigDir, getProjectRoot } from "$lib/server/paths";

/**
 * OpenCode reads `opencode.json` from the global config dir and from every
 * directory on the walk up from a request's `directory`. These files are the
 * durable source of truth for MCP servers and per-scope config — the runtime
 * `mcp.add` API is in-memory only, and `config.update` writes a file OpenCode
 * never reads back. So Kepler writes the files itself and disposes affected
 * instances to apply changes.
 */

export type ConfigScope = { kind: "global" } | { kind: "project"; projectId: string };

export function configScopeDir(scope: ConfigScope): string {
  return scope.kind === "global"
    ? getGlobalOpencodeConfigDir()
    : getProjectRoot(scope.projectId);
}

function configFilePath(scope: ConfigScope): string {
  return resolve(configScopeDir(scope), "opencode.json");
}

export async function readOpencodeConfig(scope: ConfigScope): Promise<Config> {
  try {
    return JSON.parse(await readFile(configFilePath(scope), "utf8")) as Config;
  } catch (error) {
    if (isEnoent(error)) return {};
    throw error;
  }
}

export async function updateOpencodeConfig(
  scope: ConfigScope,
  mutate: (config: Config) => void,
): Promise<Config> {
  const path = configFilePath(scope);
  const config = await readOpencodeConfig(scope);
  mutate(config);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}
