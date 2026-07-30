import { browser } from "$app/environment";

export type Theme = "light" | "dark" | "system";

// Also read by the pre-paint inline script in src/app.html; keep in sync.
const STORAGE_KEY = "kepler:theme";

function stored(): Theme {
  if (!browser) return "system";
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

function systemPrefersDark(): boolean {
  return browser && matchMedia("(prefers-color-scheme: dark)").matches;
}

function createThemeStore() {
  let theme = $state<Theme>(stored());

  function apply() {
    const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
    document.documentElement.classList.toggle("dark", dark);
  }

  function set(next: Theme) {
    theme = next;
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
    apply();
  }

  if (browser) {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (theme === "system") apply();
    });
  }

  return {
    get theme() {
      return theme;
    },
    get isDark() {
      return theme === "dark" || (theme === "system" && systemPrefersDark());
    },
    set,
  };
}

export const theme = createThemeStore();
