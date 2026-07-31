import { api, request } from "$lib/api";
import type { SessionConfigDTO, SessionConfigOption } from "$lib/contracts";
import type { ModelInfo } from "$lib/contracts";
import { chat } from "$lib/state/chat.svelte";

export interface FlatConfigValue {
  id: string;
  name: string;
  description?: string | null;
}

/** Select options may be flat or grouped; the UI renders one flat list. */
export function flattenSelectValues(option: SessionConfigOption): FlatConfigValue[] {
  if (option.type !== "select") return [];
  const values: FlatConfigValue[] = [];
  for (const entry of option.options) {
    if ("options" in entry) {
      for (const nested of entry.options) {
        values.push({ id: nested.value, name: nested.name, description: nested.description });
      }
    } else {
      values.push({ id: entry.value, name: entry.name, description: entry.description });
    }
  }
  return values;
}

export interface LoadedSessionConfig {
  config: SessionConfigDTO | null;
  /** The conversation's stored model, null while it still rides the agent default. */
  modelValue: string | null;
}

function createSessionConfigStore() {
  let modelInfo = $state<Record<string, ModelInfo>>({});
  let saving = $state(false);
  let error = $state<string | null>(null);

  async function load(conversationId: string): Promise<LoadedSessionConfig | null> {
    const { data, error: loadError } = await request(
      api.api.conversations({ id: conversationId }).config.get(),
      "Failed to load session config",
    );
    error = loadError;
    if (!data) return null;
    if (data.config) chat.setConfig(conversationId, data.config);
    if (data.usage && !chat.usageFor(conversationId)) {
      chat.setUsage(conversationId, data.usage);
    }
    modelInfo = data.modelInfo;
    return { config: data.config, modelValue: data.modelValue };
  }

  async function setOption(conversationId: string, configId: string, value: string | boolean) {
    saving = true;
    const { data, error: saveError } = await request(
      api.api.conversations({ id: conversationId }).config.put({ configId, value }),
      "Failed to update session config",
    );
    error = saveError;
    if (data) {
      if (data.config) chat.setConfig(conversationId, data.config);
      modelInfo = { ...modelInfo, ...data.modelInfo };
    }
    saving = false;
  }

  return {
    get modelInfo() {
      return modelInfo;
    },
    get saving() {
      return saving;
    },
    get error() {
      return error;
    },
    load,
    setOption,
  };
}

export const sessionConfig = createSessionConfigStore();
