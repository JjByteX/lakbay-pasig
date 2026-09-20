import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { VerificationBadge } from "./result-card";
import { ResultGroup, ResultRow } from "./search-result-list";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";
import {
  EMPTY_SEARCH_RESULTS,
  hasAnyResults,
  searchEverything,
  type GlobalSearchResults,
} from "@/lib/global-search";

// 300ms: fast enough to feel live, slow enough that a normal typing pace
// (each keystroke a few hundred ms apart) doesn't fire four queries per
// letter. No existing debounce helper in this codebase to reuse (grepped
// before writing), and this is a five-line native setTimeout/clearTimeout
// pattern, not something worth a dependency for, per ponytail's ladder.
const DEBOUNCE_MS = 300;

/**
 * Global search: one bar, shell-owned (rendered by public-shell.tsx on
 * every tab except Profile, per the resolved spec), fanning out to
 * Places, Businesses, Trails, and Events on every keystroke and showing
 * only the non-empty groups underneath. Query state and results live here,
 * not lifted further up, since no other component needs to read the
 * in-progress query text -- Discover's own list/map filtering reads this
 * bar's committed query via the `query`/`onQueryChange` props instead
 * (discover.tsx wires those to its existing filterDiscoverResults call),
 * matching the resolved spec's "Discover's own live list/map filtering
 * still runs off the same shared query text."
 *
 * Dropdown is a plain absolutely-positioned panel, not the Radix
 * DropdownMenu primitive (components/ui/dropdown-menu.tsx) -- that
 * primitive's open state is trigger-driven (click to open), the wrong
 * shape for "open as soon as there's a matching group, close on blur or
 * escape, and never trap focus away from the input while typing." No
 * Popover or Command primitive exists in this codebase to reach for
 * instead (grepped src/components/ui first, per constraints.md's
 * Inventory Before Suggesting rule), so this follows the same native
 * plain-list pattern discover-list.tsx, trails.tsx, and home.tsx's own
 * result rows already establish, rather than adding a new dependency.
 *
 * Step 8 cleanup: ResultGroup/ResultRow (search-result-list.tsx) and the
 * outside-click/Escape dismissal effect (use-dismiss-on-outside-or-
 * escape.ts) were byte-identical to admin-search-bar.tsx's own copies
 * and are now shared. Everything else stays separate -- see admin-
 * search-bar.tsx's own file comment for why (different data sources, an
 * extra Staff group, status badges, different route targets).
 */
interface GlobalSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export function GlobalSearchBar({ query, onQueryChange }: Readonly<GlobalSearchBarProps>) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_SEARCH_RESULTS);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(EMPTY_SEARCH_RESULTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(() => {
      searchEverything(trimmed).then((next) => {
        setResults(next);
        setLoading(false);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  // Close on outside click and on Escape, same two dismissal paths every
  // native browser autocomplete supports, per ux-ui-guidelines.md's
  // Familiarity principle (use the cognitive map users already have).
  // Step 8 cleanup: this effect was byte-identical to admin-search-bar.
  // tsx's own copy, now shared via src/hooks/use-dismiss-on-outside-or-
  // escape.ts.
  useDismissOnOutsideOrEscape(containerRef, () => setOpen(false));

  function goTo(path: string) {
    setOpen(false);
    navigate(path);
  }

  const trimmed = query.trim();
  const showPanel = open && trimmed.length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Lakbay Pasig"
        aria-label="Search"
        className="pl-9"
      />

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {loading && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          )}

          {!loading && !hasAnyResults(results) && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No results for &quot;{trimmed}&quot;.
            </p>
          )}

          {!loading && results.places.length > 0 && (
            <ResultGroup label="Places">
              {results.places.map((place) => (
                <ResultRow
                  key={place.id}
                  title={place.name}
                  subtitle={place.category}
                  onClick={() => goTo(`/discover/place/${place.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && results.businesses.length > 0 && (
            <ResultGroup label="Businesses">
              {results.businesses.map((business) => (
                <ResultRow
                  key={business.id}
                  title={business.name}
                  subtitle={business.category}
                  badge={<VerificationBadge status={business.verification_status} />}
                  onClick={() => goTo(`/discover/business/${business.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && results.trails.length > 0 && (
            <ResultGroup label="Trails">
              {results.trails.map((trail) => (
                <ResultRow
                  key={trail.id}
                  title={trail.name}
                  subtitle={trail.theme}
                  onClick={() => goTo(`/trails/${trail.id}`)}
                />
              ))}
            </ResultGroup>
          )}

          {!loading && results.events.length > 0 && (
            <ResultGroup label="Events">
              {results.events.map((event) => (
                <ResultRow
                  key={event.id}
                  title={event.title}
                  subtitle={event.category}
                  onClick={() => goTo(`/events/${event.id}`)}
                />
              ))}
            </ResultGroup>
          )}
        </div>
      )}
    </div>
  );
}
