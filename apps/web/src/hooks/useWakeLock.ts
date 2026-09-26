import { useEffect } from "react";

/** Keeps the screen on while a match is in play. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Denied on low battery, or the tab lost focus. Not an error worth showing.
      }
    };
    void acquire();

    // The lock is released automatically when the tab is hidden — reacquire
    // when the user comes back, or it silently stops working after one switch.
    const onVisible = () => {
      if (!cancelled && document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
