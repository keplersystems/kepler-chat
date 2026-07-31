import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/db/client";
import { mcpServer } from "$lib/server/db/schema/kepler";
import type { McpServerConfig, McpServerEntry } from "$lib/contracts";

const GLOBAL_SCOPE = "";

function scopeKey(projectId: string | null): string {
  return projectId ?? GLOBAL_SCOPE;
}

export async function listMcpServers(projectId: string | null): Promise<McpServerEntry[]> {
  const rows = await db.query.mcpServer.findMany({
    where: (fields, { inArray }) => inArray(fields.project_id, [GLOBAL_SCOPE, scopeKey(projectId)]),
  });
  return rows
    .map((row) => ({
      name: row.name,
      scope: row.project_id === GLOBAL_SCOPE ? ("global" as const) : ("project" as const),
      config: JSON.parse(row.config) as McpServerConfig,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertMcpServer(
  name: string,
  projectId: string | null,
  config: McpServerConfig,
): Promise<void> {
  const serialized = JSON.stringify(config);
  await db
    .insert(mcpServer)
    .values({ name, project_id: scopeKey(projectId), config: serialized })
    .onConflictDoUpdate({
      target: [mcpServer.name, mcpServer.project_id],
      set: { config: serialized, updated_at: new Date() },
    });
}

export async function removeMcpServer(name: string, projectId: string | null): Promise<void> {
  await db
    .delete(mcpServer)
    .where(and(eq(mcpServer.name, name), eq(mcpServer.project_id, scopeKey(projectId))));
}

export type ResolvedMcpTransport =
  | { type: "stdio"; command: string; args: string[]; env: Record<string, string> }
  | { type: "http"; url: string; headers: Record<string, string> };

export interface ResolvedMcpServer {
  name: string;
  transport: ResolvedMcpTransport;
}

/**
 * Engine-neutral MCP list for session establishment, sorted by name so the
 * set is shape-stable across calls; each driver maps it to its native config.
 */
export async function resolveMcpServers(projectId: string | null): Promise<ResolvedMcpServer[]> {
  const entries = await listMcpServers(projectId);
  const servers: ResolvedMcpServer[] = [];
  for (const entry of entries) {
    if (entry.config.enabled === false) continue;
    if (entry.config.type === "local") {
      const [command, ...args] = entry.config.command;
      servers.push({
        name: entry.name,
        transport: { type: "stdio", command, args, env: entry.config.environment ?? {} },
      });
    } else {
      servers.push({
        name: entry.name,
        transport: { type: "http", url: entry.config.url, headers: entry.config.headers ?? {} },
      });
    }
  }
  return servers;
}
