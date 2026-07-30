import type { McpLocalConfig, McpRemoteConfig, McpStatus } from "@opencode-ai/sdk/v2";
import { HttpError } from "$lib/server/http-error";
import { opencodeServer } from "$lib/server/opencode/supervisor";
import {
  configScopeDir,
  readOpencodeConfig,
  updateOpencodeConfig,
  type ConfigScope,
} from "$lib/server/opencode/config-file";
import { disposeProjectInstances } from "$lib/server/projects";
import { getSessionsRoot } from "$lib/server/paths";

export type McpServerConfig = McpLocalConfig | McpRemoteConfig;

export interface McpServerEntry {
  name: string;
  scope: ConfigScope;
  config: McpServerConfig;
  status: McpStatus | null;
}

/**
 * The directory whose OpenCode instance sees a scope's config: the sessions
 * root only inherits global config, a project root inherits global + project.
 */
function scopeStatusDir(scope: ConfigScope): string {
  return scope.kind === "global" ? getSessionsRoot() : configScopeDir(scope);
}

async function scopeStatuses(scope: ConfigScope): Promise<Record<string, McpStatus>> {
  const { client } = await opencodeServer.directoryClient(scopeStatusDir(scope));
  const { data, error } = await client.mcp.status();
  if (error || !data) throw new Error("Failed to fetch MCP status");
  return data;
}

async function scopeEntries(scope: ConfigScope): Promise<McpServerEntry[]> {
  const config = await readOpencodeConfig(scope);
  const names = Object.keys(config.mcp ?? {});
  if (names.length === 0) return [];
  const statuses = await scopeStatuses(scope);
  return names.map((name) => ({
    name,
    scope,
    config: (config.mcp as Record<string, McpServerConfig>)[name],
    status: statuses[name] ?? null,
  }));
}

export async function listMcpServers(projectId?: string): Promise<McpServerEntry[]> {
  const scopes: ConfigScope[] = [{ kind: "global" }];
  if (projectId) scopes.push({ kind: "project", projectId });
  const entries = await Promise.all(scopes.map(scopeEntries));
  return entries.flat();
}

/**
 * Re-read config everywhere a scope's entries are visible. Project config is
 * cached per-instance and flushed by disposal; the global config layer is
 * cached process-wide in OpenCode and only a restart reliably flushes it.
 */
async function applyScope(scope: ConfigScope): Promise<void> {
  if (scope.kind === "global") {
    await opencodeServer.restart();
    return;
  }
  await disposeProjectInstances(scope.projectId);
  await opencodeServer.disposeDirectory(configScopeDir(scope));
}

export async function upsertMcpServer(
  scope: ConfigScope,
  name: string,
  config: McpServerConfig,
): Promise<void> {
  await updateOpencodeConfig(scope, (file) => {
    file.mcp = { ...file.mcp, [name]: config };
  });
  await applyScope(scope);
}

export async function removeMcpServer(scope: ConfigScope, name: string): Promise<void> {
  await updateOpencodeConfig(scope, (file) => {
    if (!file.mcp || !(name in file.mcp)) throw new HttpError(404, "MCP server not found");
    delete file.mcp[name];
  });
  await applyScope(scope);
}

interface PendingOAuth {
  name: string;
  directory: string;
  expiresAt: number;
}

const OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;
const pendingOAuth = new Map<string, PendingOAuth>();

function prunePendingOAuth(): void {
  const now = Date.now();
  for (const [state, entry] of pendingOAuth) {
    if (entry.expiresAt < now) pendingOAuth.delete(state);
  }
}

/**
 * Start the OAuth flow for a remote MCP server. The redirect URI is pointed at
 * Kepler's own callback route (OpenCode's built-in loopback listener is for its
 * CLI flow), and the `state` parameter is tracked server-side because
 * OpenCode's split start/callback API does not validate it itself.
 */
export async function startMcpAuth(
  scope: ConfigScope,
  name: string,
  origin: string,
): Promise<{ authorizationUrl: string }> {
  const redirectUri = `${origin}/api/mcp/oauth/callback`;
  const config = await readOpencodeConfig(scope);
  const entry = (config.mcp as Record<string, McpServerConfig> | undefined)?.[name];
  if (!entry) throw new HttpError(404, "MCP server not found");
  if (entry.type !== "remote" || entry.oauth === false) {
    throw new HttpError(400, "MCP server does not support OAuth");
  }

  if (entry.oauth?.redirectUri !== redirectUri) {
    await updateOpencodeConfig(scope, (file) => {
      const target = (file.mcp as Record<string, McpServerConfig>)[name] as McpRemoteConfig;
      target.oauth = { ...(target.oauth || {}), redirectUri };
    });
    await applyScope(scope);
  }

  const directory = scopeStatusDir(scope);
  const { client } = await opencodeServer.directoryClient(directory);
  const { data, error } = await client.mcp.auth.start({ name });
  if (error || !data) throw new Error("Failed to start MCP OAuth flow");

  const state = new URL(data.authorizationUrl).searchParams.get("state");
  if (!state) throw new Error("Authorization URL is missing an OAuth state parameter");

  prunePendingOAuth();
  pendingOAuth.set(state, {
    name,
    directory,
    expiresAt: Date.now() + OAUTH_PENDING_TTL_MS,
  });

  return { authorizationUrl: data.authorizationUrl };
}

export async function completeMcpAuth(
  state: string,
  code: string,
): Promise<{ name: string; status: McpStatus }> {
  prunePendingOAuth();
  const pending = pendingOAuth.get(state);
  if (!pending) throw new HttpError(400, "Unknown or expired OAuth state");
  pendingOAuth.delete(state);

  const { client } = await opencodeServer.directoryClient(pending.directory);
  const { data, error } = await client.mcp.auth.callback({ name: pending.name, code });
  if (error || !data) throw new Error("Failed to complete MCP OAuth flow");
  return { name: pending.name, status: data };
}

export async function removeMcpAuth(scope: ConfigScope, name: string): Promise<void> {
  const { client } = await opencodeServer.directoryClient(scopeStatusDir(scope));
  const { error } = await client.mcp.auth.remove({ name });
  if (error) throw new Error("Failed to remove MCP credentials");
  await applyScope(scope);
}
