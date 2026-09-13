import { Outlet, useLocation } from "react-router-dom";
import { createContext, useContext, useMemo, useState } from "react";
import { BottomNav } from "./bottom-nav";
import { GlobalSearchBar } from "./global-search-bar";

// Global search: shell-owned per the resolved spec ("shared query state
// lives in the shell, not per-page, so it persists across tab switches"),
// visible on Home, Trails, Discover, Saved -- not Profile, per the same
// spec. The shell renders GlobalSearchBar into its own top bar directly
// and exposes the committed query text through this context so Discover's
// page (the one tab whose own list/map filtering needs the live text, per
// discover-query.ts's filterDiscoverResults) can read it without a second
// input or a second piece of state duplicating this one.
//
// This replaces the prior per-page TopBarSlotContext (a page pushed its
// own ReactNode into the shell): that slot only ever had one caller
// (discover.tsx) and held rendered content, not state, so it could not
// survive a tab unmount the way the resolved spec now requires. No other
// file referenced useTopBarSlot besides discover.tsx (grepped before
// removing it), so this is a full replacement, not an addition alongside
// the old mechanism, per constraints.md's No Silent Overrides rule --
// flagged here rather than left as silent drift.
interface GlobalSearchContextValue {
  query: string;
  setQuery: (query: string) => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | undefined>(undefined);

/** Lets a page (Discover) read/clear the shell's shared search query. */
export function useGlobalSearchQuery() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) throw new Error("useGlobalSearchQuery must be used within PublicShell");
  return ctx;
}

// Tabs the search bar appears on, per the resolved spec. Profile is a full
// account-settings page the person scrolls through, not a lookup surface,
// same reasoning navigation-and-access-control.md already gives Home for
// staying passive -- explicitly excluded rather than defaulting it in.
// "/events" is included even though it isn't one of the five bottom-nav
// tabs: App.tsx nests events/:id directly under the shell at the top
// level (not under any tab's own path prefix), reached from Home's
// AnnouncementCard row tap, so it's still part of the Home surface the
// search bar should stay mounted across, same reasoning as the trails/
// discover/saved detail-route case below.
const SEARCH_VISIBLE_PATHS = ["/", "/trails", "/discover", "/saved", "/events"];

function isSearchVisible(pathname: string): boolean {
  // Trails/Discover/Saved/Events detail routes (e.g. /trails/:id) nest
  // under the same tab or the same shell-level surface; the search bar
  // stays mounted across a drill-down the same way the bottom nav already
  // does, rather than disappearing the moment someone opens a detail page
  // reached from a search result. "/" matches Home's own index route
  // exactly; it never prefix-matches every other path since the `path ===
  // "/"` branch and the `startsWith` branch are both keyed per entry, not
  // a bare leading-slash check.
  return SEARCH_VISIBLE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function PublicShell() {
  const [query, setQuery] = useState("");
  const location = useLocation();
  const contextValue = useMemo(() => ({ query, setQuery }), [query]);

  return (
    <GlobalSearchContext.Provider value={contextValue}>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center px-4">
          <div className="mx-auto flex w-full max-w-md items-center">
            {isSearchVisible(location.pathname) && (
              <GlobalSearchBar query={query} onQueryChange={setQuery} />
            )}
          </div>
        </header>
        <main className="fixed inset-x-0 bottom-16 top-14 overflow-y-auto">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </GlobalSearchContext.Provider>
  );
}
