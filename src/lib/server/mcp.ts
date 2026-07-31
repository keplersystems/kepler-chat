import { and, eq } from "drizzle-orm";
import type { McpServer } from "@agentclientprotocol/sdk";
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

/**
 * ACP-shaped MCP list for session establishment. Sorted by name and shape-stable:
 * claude-agent-acp tears down its session when this fingerprint changes.
 */
export async function resolveAcpMcpServers(projectId: string | null): Promise<McpServer[]> {
  const entries = await listMcpServers(projectId);
  const servers: McpServer[] = [];
  for (const entry of entries) {
    if (entry.config.enabled === false) continue;
    if (entry.config.type === "local") {
      const [command, ...args] = entry.config.command;
      servers.push({
        name: entry.name,
        command,
        args,
        env: Object.entries(entry.config.environment ?? {}).map(([name, value]) => ({
          name,
          value,
        })),
      });
    } else {
      servers.push({
        type: "http",
        name: entry.name,
        url: entry.config.url,
        headers: Object.entries(entry.config.headers ?? {}).map(([name, value]) => ({
          name,
          value,
        })),
      });
    }
  }
  return servers;
}
