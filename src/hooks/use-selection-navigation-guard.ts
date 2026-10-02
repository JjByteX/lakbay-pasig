import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * While `active` (rows are checked), blocks in-app navigation to a different
 * route and asks the browser to confirm a tab close or reload, so a checked
 * selection is never lost by accident. Returns react-router's blocker: when
 * `blocker.state === "blocked"` the caller shows a prompt and then calls
 * `blocker.proceed()` (leave) or `blocker.reset()` (stay).
 *
 * Only a pathname change blocks. Query-string-only changes stay on the same
 * page and keep the selection. useBlocker needs a data router, which
 * main.tsx now provides.
 */
export function useSelectionNavigationGuard(active: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => active && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  return blocker;
}
