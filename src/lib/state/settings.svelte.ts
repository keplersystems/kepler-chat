import { browser } from "$app/environment";

const NOTIFY_KEY = "kepler:notify-completions";
const MOTION_KEY = "kepler:motion";
const AUTO_COMPACT_KEY = "kepler:auto-compact";
const AUTO_COMPACT_PCT_KEY = "kepler:auto-compact-pct";

export type MotionPreference = "system" | "reduced";

function createSettingsStore() {
  let notifyCompletions = $state(browser && localStorage.getItem(NOTIFY_KEY) === "true");
  let motion = $state<MotionPreference>(
    browser && localStorage.getItem(MOTION_KEY) === "reduced" ? "reduced" : "system",
  );
  let autoCompact = $state(browser ? localStorage.getItem(AUTO_COMPACT_KEY) !== "false" : true);
  let autoCompactPct = $state(
    browser ? Number(localStorage.getItem(AUTO_COMPACT_PCT_KEY) ?? 80) : 80,
  );

  function applyMotion() {
    document.documentElement.classList.toggle("reduce-motion", motion === "reduced");
  }

  if (browser) applyMotion();

  return {
    get notifyCompletions() {
      return notifyCompletions;
    },
    async setNotifyCompletions(value: boolean) {
      if (value && typeof Notification !== "undefined" && Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") value = false;
      }
      notifyCompletions = value;
      localStorage.setItem(NOTIFY_KEY, String(value));
    },
    get motion() {
      return motion;
    },
    setMotion(value: MotionPreference) {
      motion = value;
      localStorage.setItem(MOTION_KEY, value);
      applyMotion();
    },
    get autoCompact() {
      return autoCompact;
    },
    setAutoCompact(value: boolean) {
      autoCompact = value;
      localStorage.setItem(AUTO_COMPACT_KEY, String(value));
    },
    get autoCompactPct() {
      return autoCompactPct;
    },
    setAutoCompactPct(value: number) {
      autoCompactPct = value;
      localStorage.setItem(AUTO_COMPACT_PCT_KEY, String(value));
    },
  };
}

export const settings = createSettingsStore();
