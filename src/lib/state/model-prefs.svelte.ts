import { browser } from "$app/environment";
import type { AgentId } from "$lib/contracts";

const FAVORITES_KEY = "kepler:model-favorites";
const LAST_MODEL_KEY = "kepler:last-model";

function stored<T>(key: string, fallback: T): T {
  if (!browser) return fallback;
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function createModelPrefsStore() {
  let favorites = $state<string[]>(stored<string[]>(FAVORITES_KEY, []));
  // Read from the chat page's config effect and never rendered: keeping it
  // reactive would re-run that effect on every model pick.
  let lastModel = stored<Record<string, string>>(LAST_MODEL_KEY, {});

  return {
    get favorites() {
      return favorites;
    },
    isFavorite(value: string): boolean {
      return favorites.includes(value);
    },
    toggleFavorite(value: string) {
      favorites = favorites.includes(value)
        ? favorites.filter((entry) => entry !== value)
        : [...favorites, value];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    },
    lastModelFor(agentId: AgentId): string | null {
      return lastModel[agentId] ?? null;
    },
    rememberModel(agentId: AgentId, value: string) {
      lastModel = { ...lastModel, [agentId]: value };
      localStorage.setItem(LAST_MODEL_KEY, JSON.stringify(lastModel));
    },
  };
}

export const modelPrefs = createModelPrefsStore();
