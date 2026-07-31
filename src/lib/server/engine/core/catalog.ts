import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isModelOption } from "$lib/contracts";
import type {
  AgentId,
  ModelInfo,
  SessionConfigDTO,
  SessionConfigSelectGroup,
  SessionConfigSelectOption,
} from "$lib/contracts";
import { getSessionsRoot } from "$lib/server/paths";

interface CatalogModel {
  id: string;
  name: string;
  release_date?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  modalities?: { input: string[]; output: string[] };
  limit?: { context: number; output: number };
  cost?: { input: number; output: number; cache_read?: number; cache_write?: number };
}

interface CatalogProvider {
  id: string;
  name: string;
  env?: string[];
  models: Record<string, CatalogModel>;
}

type ModelCatalog = Record<string, CatalogProvider>;

const CATALOG_URL = "https://models.dev/api.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let memory: { catalog: ModelCatalog; at: number } | null = null;

function cachePath(): string {
  return resolve(getSessionsRoot(), ".cache", "models.json");
}

async function loadModelCatalog(): Promise<ModelCatalog> {
  if (memory && Date.now() - memory.at < CACHE_TTL_MS) return memory.catalog;

  const path = cachePath();
  try {
    const cached = JSON.parse(await readFile(path, "utf8")) as {
      at: number;
      catalog: ModelCatalog;
    };
    if (Date.now() - cached.at < CACHE_TTL_MS) {
      memory = { catalog: cached.catalog, at: cached.at };
      return cached.catalog;
    }
  } catch {
    // Missing or corrupt cache; fetch below.
  }

  try {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) throw new Error(`models.dev responded ${response.status}`);
    const catalog = (await response.json()) as ModelCatalog;
    memory = { catalog, at: Date.now() };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ at: memory.at, catalog }));
    return catalog;
  } catch (error) {
    if (memory) return memory.catalog;
    try {
      const stale = JSON.parse(await readFile(path, "utf8")) as { catalog: ModelCatalog };
      memory = { catalog: stale.catalog, at: 0 };
      return stale.catalog;
    } catch {
      throw new Error("Failed to load model catalog", { cause: error });
    }
  }
}

/** Providers each agent's model config values usually come from. */
const AGENT_PROVIDER_HINTS: Record<AgentId, string[]> = {
  opencode: [],
  claude: ["anthropic"],
  codex: ["openai"],
};

function toInfo(provider: CatalogProvider, model: CatalogModel): ModelInfo {
  return {
    providerId: provider.id,
    modelId: model.id,
    name: model.name,
    contextLimit: model.limit?.context ?? null,
    cost: model.cost ?? null,
    reasoning: model.reasoning ?? false,
    toolCall: model.tool_call ?? false,
    input: (model.modalities?.input ?? []) as ModelInfo["input"],
    output: (model.modalities?.output ?? []) as ModelInfo["output"],
  };
}

interface Indexed {
  /** Exact model id -> candidates, so lookups avoid scanning every provider. */
  byId: Map<string, ModelInfo[]>;
  /** Family token (e.g. "opus") -> newest model first, for agents that use aliases. */
  byFamily: Map<string, ModelInfo[]>;
}

function buildIndex(catalog: ModelCatalog): Indexed {
  const byId = new Map<string, ModelInfo[]>();
  const dated: Array<{ info: ModelInfo; tokens: string[]; released: string }> = [];
  for (const provider of Object.values(catalog)) {
    for (const model of Object.values(provider.models)) {
      const info = toInfo(provider, model);
      byId.set(model.id, [...(byId.get(model.id) ?? []), info]);
      dated.push({
        info,
        tokens: model.id.split(/[-_.]/).filter(Boolean),
        released: model.release_date ?? "",
      });
    }
  }
  dated.sort((a, b) => b.released.localeCompare(a.released));
  const byFamily = new Map<string, ModelInfo[]>();
  for (const entry of dated) {
    for (const token of new Set(entry.tokens)) {
      byFamily.set(token, [...(byFamily.get(token) ?? []), entry.info]);
    }
  }
  return { byId, byFamily };
}

/**
 * Agents decorate model values: `:variant` suffixes (opencode) and `[1m]`
 * extended-context markers (claude). The marker is the real context window, so
 * it overrides the base model's.
 */
function parseModelValue(modelValue: string): { base: string; contextOverride: number | null } {
  const marker = modelValue.match(/\[(\d+)(k|m)\]$/i);
  const base = modelValue.replace(/\[[^\]]*\]$/, "").split(":")[0];
  if (!marker) return { base, contextOverride: null };
  const size = Number(marker[1]) * (marker[2].toLowerCase() === "m" ? 1_000_000 : 1_000);
  return { base, contextOverride: size };
}

let indexed: { catalog: ModelCatalog; index: Indexed } | null = null;

function lookup(
  catalog: ModelCatalog,
  index: Indexed,
  agentId: AgentId,
  modelValue: string,
): ModelInfo | null {
  const { base, contextOverride } = parseModelValue(modelValue);
  const withOverride = (info: ModelInfo): ModelInfo =>
    contextOverride === null ? info : { ...info, contextLimit: contextOverride };

  const slash = base.indexOf("/");
  if (slash > 0) {
    const provider = catalog[base.slice(0, slash)];
    const model = provider?.models[base.slice(slash + 1)];
    if (provider && model) return withOverride(toInfo(provider, model));
  }

  const hints = AGENT_PROVIDER_HINTS[agentId];
  const preferred = (candidates: ModelInfo[]): ModelInfo | undefined =>
    candidates.find((info) => hints.includes(info.providerId)) ?? candidates[0];

  const bare = slash > 0 ? base.slice(slash + 1) : base;
  const exact = index.byId.get(bare);
  if (exact) return withOverride(preferred(exact)!);

  // A family alias ("opus", "sonnet") resolves to that family's newest model.
  const family = index.byFamily.get(bare.toLowerCase());
  const match = family && hints.length > 0
    ? family.find((info) => hints.includes(info.providerId))
    : undefined;
  return match ? withOverride(match) : null;
}

/**
 * Best-effort enrichment of an agent's opaque model config values with
 * models.dev metadata. OpenCode values are "provider/model" (optionally with a
 * variant suffix); other agents use bare model ids or aliases.
 */
export async function modelInfoFor(
  agentId: AgentId,
  modelValues: string[],
): Promise<Record<string, ModelInfo>> {
  const catalog = await loadModelCatalog();
  if (indexed?.catalog !== catalog) {
    indexed = { catalog, index: buildIndex(catalog) };
  }
  const info: Record<string, ModelInfo> = {};
  for (const value of modelValues) {
    const found = lookup(catalog, indexed.index, agentId, value);
    if (found) info[value] = found;
  }
  return info;
}

/** Enrichment for the model option of a session config, keyed by option value. */
export function modelInfoForConfig(
  agentId: AgentId,
  config: SessionConfigDTO | null,
): Promise<Record<string, ModelInfo>> {
  const option = config?.configOptions.find(
    (entry) => isModelOption(entry) && entry.type === "select",
  );
  if (option?.type !== "select") return Promise.resolve({});
  const entries: (SessionConfigSelectOption | SessionConfigSelectGroup)[] = option.options;
  return modelInfoFor(
    agentId,
    entries.flatMap((entry) =>
      "options" in entry ? entry.options.map((item) => item.value) : [entry.value],
    ),
  );
}

/** Env var names each provider reads, so key entry does not rely on memory. */
export async function providerEnvVars(): Promise<Array<{ name: string; provider: string }>> {
  const catalog = await loadModelCatalog();
  const seen = new Map<string, string>();
  for (const provider of Object.values(catalog)) {
    for (const name of provider.env ?? []) {
      if (!seen.has(name)) seen.set(name, provider.name);
    }
  }
  return [...seen]
    .map(([name, provider]) => ({ name, provider }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
