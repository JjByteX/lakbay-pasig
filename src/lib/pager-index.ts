import { isDiscoverDetailPath } from "@/lib/discover-memory";

// Which pager page a pathname belongs to. Lives here, not in page-pager.tsx,
// so that file exports only a component (react-refresh/only-export-components).

/** The four swipeable pages, in bottom-nav order. */
export const PATHS = ["/", "/trails", "/discover", "/saved"] as const;
/** Index of the Discover slot in PATHS. */
export const DISCOVER = 2;

// Drops every trailing slash by scanning back from the end. A /\/+$/ regex
// retries from each slash in a long run of them (super-linear), this is one pass.
function stripTrailingSlashes(pathname: string): string {
  let end = pathname.length;
  while (end > 0 && pathname[end - 1] === "/") end--;
  return pathname.slice(0, end);
}

/** Index of the pager page for a pathname, or -1 when the route isn't one. */
export function pagerIndexFor(pathname: string): number {
  const path = pathname.length > 1 ? stripTrailingSlashes(pathname) : pathname;
  if (isDiscoverDetailPath(path)) return DISCOVER;
  return (PATHS as readonly string[]).indexOf(path);
}
