import { browser } from "$app/environment";
import { api } from "$lib/api";
import type { ModelSelection, Provider } from "$lib/types";

const LAST_MODEL_KEY = "kepler:last-model";
const FAVORITES_KEY = "kepler:model-favorites";

function createProvidersStore() {
  let providers = $state<Provider[]>([]);
  let connected = $state<string[]>([]);
  let loading = $state(false);
  let loaded = false;
  let favorites = $state<string[]>(
    browser ? JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]") : [],
  );

  function toggleFavorite(value: string) {
    favorites = favorites.includes(value)
      ? favorites.filter((f) => f !== value)
      : [...favorites, value];
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }

  async function load() {
    if (loaded || loading) return;
    loading = true;
    const { data, error } = await api.api.providers.get();
    if (!error && data) {
      providers = (data.providers.all ?? []) as Provider[];
      connected = data.providers.connected ?? [];
      loaded = true;
    }
    loading = false;
  }

  function isValid(model: ModelSelection): boolean {
    return (
      connected.includes(model.providerID) &&
      providers.some(
        (p) =>
          p.id === model.providerID &&
          Object.values(p.models ?? {}).some((m) => m.id === model.modelID),
      )
    );
  }

  function lastModel(): ModelSelection | null {
    if (!browser) return null;
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(LAST_MODEL_KEY) ?? "null",
      ) as ModelSelection | null;
      return stored && isValid(stored) ? stored : null;
    } catch {
      return null;
    }
  }

  function remember(model: ModelSelection) {
    if (!browser) return;
    window.localStorage.setItem(LAST_MODEL_KEY, JSON.stringify(model));
  }

  function defaultModel(): ModelSelection | null {
    const remembered = lastModel();
    if (remembered) return remembered;
    const firstConnected = providers.find((p) => connected.includes(p.id));
    const entries = firstConnected?.models ? Object.entries(firstConnected.models) : [];
    if (!firstConnected || entries.length === 0) return null;
    const [modelId, model] = entries[0];
    return { providerID: firstConnected.id, modelID: model.id ?? modelId };
  }

  return {
    get providers() {
      return providers;
    },
    get connected() {
      return connected;
    },
    get loading() {
      return loading;
    },
    get favorites() {
      return favorites;
    },
    toggleFavorite,
    load,
    lastModel,
    remember,
    defaultModel,
  };
}

export const modelCatalog = createProvidersStore();
