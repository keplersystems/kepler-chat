import { browser } from "$app/environment";
import { api, apiErrorMessage } from "$lib/api";
import type { ModelSelection, Provider } from "$lib/types";

const LAST_MODEL_KEY = "kepler:last-model";
const FAVORITES_KEY = "kepler:model-favorites";

function readStorage<T>(key: string, fallback: T): T {
  if (!browser) return fallback;
  try {
    return (JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function createProvidersStore() {
  let providers = $state<Provider[]>([]);
  let connected = $state<string[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let loaded = false;
  let favorites = $state<string[]>(readStorage(FAVORITES_KEY, []));

  function toggleFavorite(value: string) {
    favorites = favorites.includes(value)
      ? favorites.filter((f) => f !== value)
      : [...favorites, value];
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }

  async function load() {
    if (loaded || loading) return;
    loading = true;
    const { data, error: loadError } = await api.api.providers.get();
    if (loadError || !data) {
      error = apiErrorMessage(loadError?.value, "Failed to load providers");
    } else {
      providers = data.providers.all;
      connected = data.providers.connected;
      error = null;
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
    const stored = readStorage<ModelSelection | null>(LAST_MODEL_KEY, null);
    return stored && isValid(stored) ? stored : null;
  }

  function remember(model: ModelSelection) {
    if (!browser) return;
    window.localStorage.setItem(LAST_MODEL_KEY, JSON.stringify(model));
  }

  function defaultModel(): ModelSelection | null {
    const remembered = lastModel();
    if (remembered) return remembered;
    const firstConnected = providers.find((p) => connected.includes(p.id));
    const [model] = Object.values(firstConnected?.models ?? {});
    if (!firstConnected || !model) return null;
    return { providerID: firstConnected.id, modelID: model.id };
  }

  /** Load the catalog and return the model a fresh page should start with. */
  async function loadDefault(): Promise<ModelSelection | null> {
    await load();
    return defaultModel();
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
    get error() {
      return error;
    },
    get favorites() {
      return favorites;
    },
    toggleFavorite,
    load,
    loadDefault,
    lastModel,
    remember,
    defaultModel,
  };
}

export const modelCatalog = createProvidersStore();
