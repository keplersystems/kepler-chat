import { browser } from "$app/environment";

const NOTIFY_KEY = "kepler:notify-completions";
const MOTION_KEY = "kepler:motion";

export type MotionPreference = "system" | "reduced";

function createSettingsStore() {
  let notifyCompletions = $state(browser && localStorage.getItem(NOTIFY_KEY) === "true");
  let motion = $state<MotionPreference>(
    browser && localStorage.getItem(MOTION_KEY) === "reduced" ? "reduced" : "system",
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
  };
}

export const settings = createSettingsStore();
