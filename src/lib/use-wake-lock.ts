import { useEffect } from "react";

/**
 * Keeps the screen on while `active` is true, so the phone does not sleep
 * mid-route and cut off the GPS and the voice guidance. No UI: the system
 * can handle it (ux-ui-guidelines.md, Purpose), so there is nothing to tap.
 *
 * The browser drops the lock whenever the page is hidden, so it is asked for
 * again when the page comes back. A browser with no Wake Lock API, or a
 * refusal (low battery, a permissions policy), is a silent no-op: the route
 * works the same, the screen just follows the phone's own timeout.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Refused by the browser or device. Nothing to do.
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      void sentinel?.release();
    };
  }, [active]);
}
