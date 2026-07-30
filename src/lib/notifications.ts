import { settings } from "$lib/state/settings.svelte";

/** Desktop notification when a run finishes while the tab is hidden. */
export function notifyRunFinished(succeeded: boolean): void {
  if (
    !settings.notifyCompletions ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted" ||
    document.visibilityState !== "hidden"
  ) {
    return;
  }
  const notification = new Notification("Kepler", {
    body: succeeded ? "Response finished" : "Run stopped with an error",
  });
  notification.onclick = () => window.focus();
}
