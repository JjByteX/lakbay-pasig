import { useState } from "react";
import type { Coordinates } from "@/lib/discover-query";
import { sortDiscoverResults } from "@/lib/discover-query";
import type { DiscoverResult } from "@/lib/discover-types";
import { Skeleton } from "@/components/ui/skeleton";
import { ResultCard, VerificationBadge } from "./result-card";

interface DiscoverListProps {
  results: DiscoverResult[];
  userLocation: Coordinates | null;
  // Phase 8.1: query-in-flight, distinct from the zero-results empty state
  // below, per discover.tsx's shared `resultsLoading` flag.
  resultsLoading: boolean;
  // Phase 8.3: a specific message when the combined fetch failed outright,
  // distinct from a fetch that succeeded with zero rows (Phase 8.2's empty
  // state). Null when there is no error.
  resultsError: string | null;
}

/**
 * Phase 5.1-5.2 (step-5-phases.md): list surface toggled from the map, not
 * a second tab or route, per step-5-plan.md's Shape section (one combined
 * view). Renders the identical filtered result set the map uses, sorted by
 * distance if `userLocation` is known, by name otherwise (Phase 3.3's
 * sortDiscoverResults). Same result card component as the map (Phase 4.4,
 * exported from result-card.tsx) opens on row tap, per step-5-plan.md's
 * "same card whether reached from map or list."
 *
 * Simple list, not a table, per ux-ui-guidelines.md's Component Sizing
 * Rules (a table implies a contained structured block; a scrollable list
 * of variable-length results is the simple-list case that rule calls for).
 * Each row is a plain button, no card wrapper per row, since ux-ui-
 * guidelines.md's card nesting rule forbids a card inside another card and
 * the row itself opens into the shared card component, it should not also
 * be a card.
 */
export function DiscoverList({ results, userLocation, resultsLoading, resultsError }: DiscoverListProps) {
  const [selected, setSelected] = useState<DiscoverResult | null>(null);
  const sorted = sortDiscoverResults(results, userLocation);

  if (resultsError) {
    // Phase 8.3: checked first, ahead of loading/empty, an error is a more
    // specific and more serious condition than either ("the fetch could
    // not complete" versus "still waiting" or "completed with nothing to
    // show") and should never be reported as one of those instead.
    // text-destructive matches this codebase's one existing error-message
    // convention (e.g. admin-staff-detail.tsx's notFound branch), not a
    // new color or component invented for this screen, per ux-ui-
    // guidelines.md's Consistency Rules.
    return (
      <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm text-destructive">
        {resultsError}
      </div>
    );
  }

  if (resultsLoading) {
    // Phase 8.1: row-shaped skeletons, not a spinner or "Loading…" text,
    // since this list already has a fixed row shape (name/category/badge)
    // to preview; reuses the existing Skeleton primitive (skeleton.tsx),
    // unused elsewhere in this codebase until now, rather than adding a
    // spinner dependency, per ponytail's native-feature-first rung. Three
    // rows is a placeholder count, not tied to the eventual result count.
    return (
      <ul className="mx-auto flex max-w-md flex-col divide-y divide-border">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex flex-col gap-2 px-6 py-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-20" />
          </li>
        ))}
      </ul>
    );
  }

  if (sorted.length === 0) {
    // Phase 8.2: confirmed during the cross-cutting states pass as already
    // correct, this is the same "one clear, specific label" shape ux-ui-
    // guidelines.md's Label Rules require. Wording matches discover-map.tsx's
    // own empty-state pill verbatim (same filtered set feeds both surfaces).
    return (
      <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
        No results match your search and filters.
      </div>
    );
  }

  return (
    <>
      <ul className="mx-auto flex max-w-md flex-col divide-y divide-border">
        {sorted.map((result) => (
          <li key={`${result.kind}-${result.id}`}>
            <button
              type="button"
              onClick={() => setSelected(result)}
              className="flex w-full flex-col items-start gap-1 px-6 py-4 text-left transition-colors hover:bg-muted"
            >
              <span className="text-base font-semibold text-foreground">{result.name}</span>
              <span className="text-sm text-muted-foreground">{result.category}</span>
              <VerificationBadge status={result.verification_status} />
            </button>
          </li>
        ))}
      </ul>
      <ResultCard result={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}
