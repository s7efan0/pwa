import { registerSW } from "virtual:pwa-register";

/** Check for a new worker every hour while the tab is open. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker AND keeps it up to date.
 *
 * vite-plugin-pwa's auto-injected registerSW.js is a one-liner that only calls
 * navigator.serviceWorker.register — it does no update handling whatsoever,
 * even with registerType: 'autoUpdate'. The update logic lives in this virtual
 * module, so unless the app imports it the worker installs once and then
 * serves stale precached HTML and JS indefinitely: the app silently keeps
 * showing an old build until someone manually clears storage.
 *
 * Browsers only check for a new worker on navigation, or roughly every 24h.
 * That is far too slow while iterating, hence the explicit polling below.
 */
export function setupServiceWorker(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const check = () => {
        // Pointless offline, and it would log a failed fetch every time.
        if (navigator.onLine) void registration.update();
      };

      setInterval(check, UPDATE_INTERVAL_MS);

      // Returning to the tab is the moment a stale build is most likely and
      // most annoying — check then too.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}
