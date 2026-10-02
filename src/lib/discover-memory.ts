import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Remembers where the Discover tab was left, so swiping (or tapping the
// bottom nav) to another page and back reopens the same place or business
// page instead of dropping to the map. Module-level on purpose: it has to
// outlive the mobile pager, which unmounts whenever the user opens a route
// that isn't one of the four tabs (an event, a trail). Lost on a full page
// reload, which is the right amount of memory.
let resumePath = "/discover";

// Passed as navigation state when returning to a remembered page, so that
// page's Back button knows browser history now has other tabs in it.
const RESTORED_STATE = { discoverRestored: true } as const;

/** Place or business detail page, the only things under /discover besides the map. */
export function isDiscoverDetailPath(path: string): boolean {
  return /^\/discover\/(place|business)\/[^/?#]+\/?(\?.*)?$/.test(path);
}

export function rememberDiscoverPath(path: string): void {
  resumePath = path;
}

export function getDiscoverResumePath(): string {
  return resumePath;
}

/** Where the Discover tab should go from another page: the remembered page. */
export function discoverResumeTarget(): { to: string; state?: typeof RESTORED_STATE } {
  return resumePath === "/discover" ? { to: "/discover" } : { to: resumePath, state: RESTORED_STATE };
}

/**
 * Back for the place and business pages. Normally history is [origin, this
 * page] and -1 is right. After the page was restored from another tab,
 * history is [..., this page, other tab, this page], so -1 would land on the
 * other tab; go to the Discover map instead.
 */
export function useDiscoverBack(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const restored = Boolean((location.state as { discoverRestored?: boolean } | null)?.discoverRestored);
  return useCallback(() => {
    if (restored) navigate("/discover");
    else navigate(-1);
  }, [navigate, restored]);
}
