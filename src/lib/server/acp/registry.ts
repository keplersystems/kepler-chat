import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { AgentId } from "$lib/contracts";
import { getSessionsRoot } from "$lib/server/paths";
import { readPermissionSettings } from "$lib/server/permissions";
import { loadAgentEnv } from "./env-profiles";

const require = createRequire(import.meta.url);

export interface AgentDefinition {
  id: AgentId;
  name: string;
  command(): string[];
  env(): Promise<Record<string, string>>;
  /** Sandbox-writable paths beyond the sessions root (credential stores, caches). */
  writablePaths(): string[];
}

function packageEntry(pkg: string): string {
  const manifestPath = require.resolve(`${pkg}/package.json`);
  const manifest = require(`${pkg}/package.json`) as { bin: Record<string, string> };
  const [bin] = Object.values(manifest.bin);
  return resolve(dirname(manifestPath), bin);
}

// The adapters are node programs (engines >=22); Bun can be the host runtime,
// so prefer the system node over process.execPath.
function nodeArgv(entry: string): string[] {
  return ["node", entry];
}

function agentTmpDir(agentId: AgentId): string {
  return resolve(getSessionsRoot(), ".tmp", agentId);
}

function baseEnv(agentId: AgentId): Record<string, string> {
  return { TMPDIR: agentTmpDir(agentId) };
}

const opencode: AgentDefinition = {
  id: "opencode",
  name: "OpenCode",
  command: () => [process.env.KEPLER_OPENCODE_BIN ?? "opencode", "acp"],
  env: async () => ({
    ...baseEnv("opencode"),
    ...(await loadAgentEnv("opencode")),
    npm_config_cache: resolve(agentTmpDir("opencode"), "npm-cache"),
    OPENCODE_PERMISSION: JSON.stringify(await readPermissionSettings()),
  }),
  writablePaths: () => [
    resolve(homedir(), ".local", "share", "opencode"),
    resolve(homedir(), ".local", "state", "opencode"),
    resolve(homedir(), ".config", "opencode"),
    resolve(homedir(), ".cache", "opencode"),
  ],
};

const claude: AgentDefinition = {
  id: "claude",
  name: "Claude Code",
  command: () => nodeArgv(packageEntry("@agentclientprotocol/claude-agent-acp")),
  env: async () => ({
    ...baseEnv("claude"),
    ...(await loadAgentEnv("claude")),
  }),
  writablePaths: () => [
    resolve(homedir(), ".claude"),
    resolve(homedir(), ".claude.json"),
    resolve(homedir(), ".claude.json.backup"),
  ],
};

const codex: AgentDefinition = {
  id: "codex",
  name: "Codex",
  command: () => nodeArgv(packageEntry("@agentclientprotocol/codex-acp")),
  env: async () => ({
    ...baseEnv("codex"),
    ...(await loadAgentEnv("codex")),
  }),
  writablePaths: () => [resolve(homedir(), ".codex")],
};

export const AGENTS: Record<AgentId, AgentDefinition> = { opencode, claude, codex };

export function requireAgent(agentId: string): AgentDefinition {
  const def = AGENTS[agentId as AgentId];
  if (!def) throw new Error(`Unknown agent: ${agentId}`);
  return def;
}
