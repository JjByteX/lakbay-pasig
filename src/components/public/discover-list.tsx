import { useEffect, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Coordinates } from "@/lib/discover-query";
import { sortDiscoverResults } from "@/lib/discover-query";
import { formatItemPrice, matchingItem } from "@/lib/item-match";
import type { DiscoverResult } from "@/lib/discover-types";
import type { RouteGeometry } from "@/lib/directions";
import { distanceAway, joinMeta } from "@/lib/distance-label";
import { categoryColor } from "@/lib/category-colors";
import { PRESS_CARD, PRESS_TARGET } from "@/lib/motion";
import { useAuth } from "@/lib/auth-context";
import { fetchSavedPlaceIds } from "@/lib/saved-places";
import { fetchSavedBusinessIds } from "@/lib/saved-businesses";
import { getCategoryIcon } from "@/lib/place-category-icons";
import { getBusinessCategoryIcon } from "@/lib/business-category-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "./page-container";
import { PhotoCaptionOverlay } from "./photo-caption-overlay";
import { ResultCard, VerificationBadge } from "./result-card";
import { SaveButton } from "./save-button";

interface DiscoverListProps {
  results: DiscoverResult[];
  // The search text, so a business card can show the item that matched it.
  query: string;
  // The live GPS fix. Used only for the straight-line distance sort below
  // (sortDiscoverResults) and the "away" line on each card, which stay on the
  // live position even when a custom From is set --
  // directions-distance-and-from-plan.md, "Not touched".
  userLocation: Coordinates | null;
  // directions-distance-and-from-phases.md Phase 3.2: the route origin from
  // the shell's directions state (customFrom?.coordinates ?? userLocation).
  // Added beside userLocation, not in place of it: this component still
  // needs the live fix for the sort, and only ResultCard's Directions
  // button needs the origin. Handed straight to ResultCard below.
  origin: Coordinates | null;
  // Phase 8.1: query-in-flight, distinct from the zero-results empty state
  // below, per discover.tsx's shared `resultsLoading` flag.
  resultsLoading: boolean;
  // Phase 8.3: set when the combined fetch failed outright, distinct from a
  // fetch that succeeded with zero rows (Phase 8.2's empty state). Null when
  // there is no error. Fixed human copy from discover.tsx, shown as-is.
  resultsError: string | null;
  // "Try again" on the error state. discover.tsx bumps its fetch counter.
  onRetry: () => void;
  // Whether a search or any filter is narrowing the results. Picks the empty
  // state's copy and whether it offers "Clear filters".
  hasFilters: boolean;
  // Clears the search text and every filter in one go (discover.tsx owns
  // that state), so a filtered-to-nothing list is never a dead end.
  onClearFilters: () => void;
  // Map-marker-icons-phase follow-up: this list has no map instance of its
  // own to draw a route onto (DiscoverMap and DiscoverList are mutually
  // exclusive in discover.tsx), so a Directions tap here hands the
  // geometry up to discover.tsx, which both stores it and switches view to
  // "map" so the drawn line is actually visible.
  // directions-panel-phases.md Phase 4.2: result is now included alongside
  // geometry (result-card.tsx's own widened signature), passed straight
  // through unchanged -- this file has no reason to read it itself.
  onRouteFound: (geometry: RouteGeometry, result: DiscoverResult) => void;
}

// Same grid saved.tsx uses for its photo cards (PHOTO_GRID): two across on
// mobile, three at md+. gap-4 is on the 8px grid. Kept as a local copy, not an
// import: saved.tsx is a page and exports only its component.
const PHOTO_GRID = "grid grid-cols-2 gap-4 md:grid-cols-3";

// Photo plus a footer of up to four short lines, taller than Saved's card, so
// the placeholder is a taller box than saved.tsx's aspect-[4/5].
function ListSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-40" />
      <div className={PHOTO_GRID}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
        ))}
      </div>
    </>
  );
}

// "1 place", "12 places".
function count(n: number, one: string, many: string): string | null {
  if (n === 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * One result as a photo card, the same card the Home rows (category-photo-
 * row.tsx's PhotoCard) and the Saved page (saved-place-row.tsx) draw: cover
 * photo with the name over it (photo-caption-overlay.tsx), the details in a
 * footer on the card surface, the save heart at the footer's right, same hover
 * lift. Same composition as SavedPlaceRow: the heart is a sibling of the tap
 * targets, since a button cannot contain another button. The photo and the
 * footer text are each a button that opens the preview. Everything inside
 * them is a <span>, since a button can only hold phrasing content.
 *
 * Not SavedPlaceRow itself: this footer carries more (category icon, matched
 * item, distance) and its heart reads a batched saved-state (see
 * DiscoverList) instead of asking per card.
 *
 * Footer, top to bottom: the category with its icon in the category color
 * (the same icon and color the map marker and legend use for it), the item
 * that matched the search (businesses only), the straight-line distance, and
 * the verification label. Each line shows only when it has something to say.
 *
 * The photo is an <img loading="lazy"> rather than a CSS background (what Home
 * and Saved use): this list can be long and a background image always loads
 * eagerly. No photo: a muted square with the category icon, so a run of
 * photo-less listings reads as cards, not as empty gray boxes.
 */
function ResultPhotoCard({
  result,
  query,
  userLocation,
  initialSaved,
  onSelect,
  onToggleSaved,
}: Readonly<{
  result: DiscoverResult;
  query: string;
  userLocation: Coordinates | null;
  // The batched saved-state for this card's heart (SaveButton's own prop).
  initialSaved: boolean | null | undefined;
  onSelect: () => void;
  onToggleSaved: (saved: boolean) => void;
}>) {
  const Icon =
    result.kind === "place"
      ? getCategoryIcon(result.categoryIcon ?? "")
      : getBusinessCategoryIcon(result.categoryIcon ?? "");
  // Shows why a store matched when the query hit an item name.
  const item = result.kind === "business" ? matchingItem(result, query) : null;
  const distance = distanceAway(userLocation, result.latitude, result.longitude);

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card hover:-translate-y-0.5 ${PRESS_CARD}`}>
      <button
        type="button"
        onClick={onSelect}
        className={`${PRESS_TARGET} relative block aspect-square w-full shrink-0 overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
      >
        {result.coverPhotoUrl ? (
          <img
            src={result.coverPhotoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Icon className="h-8 w-8" aria-hidden="true" />
          </span>
        )}
        <PhotoCaptionOverlay name={result.name} />
      </button>
      <div className="flex flex-1 items-start justify-between gap-2 p-2">
        <button
          type="button"
          onClick={onSelect}
          className={`${PRESS_TARGET} flex min-w-0 flex-1 flex-col items-start gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          {result.category && (
            <span className="flex max-w-full items-center gap-1 text-xs text-muted-foreground">
              <Icon
                className="h-4 w-4 shrink-0"
                style={{ color: categoryColor(result.categoryColor) }}
                aria-hidden="true"
              />
              <span className="truncate">{result.category}</span>
            </span>
          )}
          {item && (
            <span className="text-xs">
              <span className="text-foreground">{item.name}</span>{" "}
              <span className="text-muted-foreground">{formatItemPrice(item.price)}</span>
            </span>
          )}
          {distance && <span className="text-xs text-muted-foreground">{distance}</span>}
          <VerificationBadge status={result.verification_status} />
        </button>
        <SaveButton
          kind={result.kind}
          itemId={result.id}
          initialSaved={initialSaved}
          onToggle={onToggleSaved}
        />
      </div>
    </div>
  );
}

/**
 * Phase 5.1-5.2 (step-5-phases.md): list surface toggled from the map, not
 * a second tab or route, per step-5-plan.md's Shape section (one combined
 * view). Renders the identical filtered result set the map uses, sorted by
 * distance if `userLocation` is known, by name otherwise (Phase 3.3's
 * sortDiscoverResults). Same result card component as the map (Phase 4.4,
 * exported from result-card.tsx) opens on card tap, per step-5-plan.md's
 * "same card whether reached from map or list."
 *
 * Hearts: a signed-in person's saved places and businesses are fetched once
 * each (fetchSavedPlaceIds / fetchSavedBusinessIds, two requests total) and
 * every card's heart reads its answer from them, instead of each SaveButton
 * checking its own item on mount (one request per card). A guest sees the
 * same hearts, and a tap opens the sign-in popup, same as everywhere else.
 *
 * Modernized to match the other tabs: a photo-card grid (ResultPhotoCard
 * above, the Saved page's grid), inside PageContainer width="wide" like
 * Trails and Saved so desktop gets the same wide column instead of a 448px
 * strip, ErrorState with a retry, and an EmptyState that can clear the
 * filters. A muted line on top counts the places and businesses shown and
 * names the sort (the list silently switches between distance and name
 * depending on whether a location fix exists, and nothing said so before).
 * It replaces the earlier text-row list (ux-ui-guidelines.md's "simple list"
 * sizing rule fit a handful of rows, not a photo-led directory).
 *
 * Map-marker-icons-phase follow-up: ResultCard's Directions button works
 * from here too, same as from the map's own popup, but this component has
 * no map to draw a route onto -- onRouteFound hands the geometry up to
 * discover.tsx, which owns the one shared route value both this list and
 * DiscoverMap read from, and switches the page to map view so the line is
 * visible.
 */
export function DiscoverList({
  results,
  query,
  userLocation,
  origin,
  resultsLoading,
  resultsError,
  onRetry,
  hasFilters,
  onClearFilters,
  onRouteFound,
}: Readonly<DiscoverListProps>) {
  const [selected, setSelected] = useState<DiscoverResult | null>(null);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // null: not loaded yet (or signed out). A failed load is treated as "nothing
  // saved", the same thing a failed per-heart check fell back to.
  const [savedIds, setSavedIds] = useState<{ places: Set<string>; businesses: Set<string> } | null>(null);

  useEffect(() => {
    if (!userId) {
      setSavedIds(null);
      return;
    }
    let cancelled = false;
    Promise.all([fetchSavedPlaceIds(userId), fetchSavedBusinessIds(userId)])
      .then(([places, businesses]) => {
        if (!cancelled) setSavedIds({ places, businesses });
      })
      .catch(() => {
        if (!cancelled) setSavedIds({ places: new Set(), businesses: new Set() });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // A heart's own state resets when its card unmounts (a filter hides it), so
  // the sets follow every successful toggle and a card that comes back shows
  // what the person last chose.
  const handleToggleSaved = (result: DiscoverResult, saved: boolean) =>
    setSavedIds((prev) => {
      if (!prev) return prev;
      const next = { places: new Set(prev.places), businesses: new Set(prev.businesses) };
      const target = result.kind === "place" ? next.places : next.businesses;
      if (saved) target.add(result.id);
      else target.delete(result.id);
      return next;
    });

  // Guest: undefined, the heart skips any check and shows unsaved. Signed in
  // and still loading: null. Loaded: the known answer.
  const initialSavedFor = (result: DiscoverResult): boolean | null | undefined => {
    if (!userId) return undefined;
    if (!savedIds) return null;
    return (result.kind === "place" ? savedIds.places : savedIds.businesses).has(result.id);
  };

  const sorted = sortDiscoverResults(results, userLocation);

  // States ordered error, then loading, then empty, then loaded, same order
  // trails.tsx and saved.tsx use. An error is a more specific condition than
  // either of the others ("the fetch could not complete" versus "still
  // waiting" or "completed with nothing to show") and is never reported as
  // one of those instead.
  if (resultsError) {
    return (
      <PageContainer width="wide" className="gap-4">
        <ErrorState className="min-h-[60dvh]" onRetry={onRetry}>
          {resultsError}
        </ErrorState>
      </PageContainer>
    );
  }

  if (resultsLoading) {
    return (
      <PageContainer width="wide" className="gap-4">
        <ListSkeleton />
      </PageContainer>
    );
  }

  if (sorted.length === 0) {
    // Wording for the filtered case matches discover-map.tsx's own empty-state
    // pill verbatim (same filtered set feeds both surfaces). With nothing
    // narrowing the set there is no "matching" to speak of.
    return (
      <PageContainer width="wide" className="gap-4">
        <EmptyState
          icon={MagnifyingGlass}
          className="min-h-[60dvh]"
          action={
            hasFilters ? (
              <Button variant="outline" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        >
          {hasFilters
            ? "Matching places and businesses will appear here."
            : "Places and businesses will appear here."}
        </EmptyState>
      </PageContainer>
    );
  }

  const placeCount = sorted.filter((r) => r.kind === "place").length;
  const summary = joinMeta([
    count(placeCount, "place", "places"),
    count(sorted.length - placeCount, "business", "businesses"),
    userLocation ? "Nearest first" : "A to Z",
  ]);

  return (
    <>
      <PageContainer width="wide" className="gap-4">
        <p className="text-sm text-muted-foreground">{summary}</p>
        <ul className={PHOTO_GRID}>
          {sorted.map((result) => (
            <li key={`${result.kind}-${result.id}`} className="min-w-0">
              <ResultPhotoCard
                result={result}
                query={query}
                userLocation={userLocation}
                initialSaved={initialSavedFor(result)}
                onSelect={() => setSelected(result)}
                onToggleSaved={(saved) => handleToggleSaved(result, saved)}
              />
            </li>
          ))}
        </ul>
      </PageContainer>
      <ResultCard
        result={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        // Phase 3.2: origin, not userLocation -- ResultCard's prop keeps its
        // old name (renaming needs approval) but now carries the route
        // origin, so a custom From unlocks Directions from the List view
        // too. The distance sort above stays on userLocation.
        userLocation={origin}
        distanceFrom={userLocation}
        onRouteFound={onRouteFound}
      />
    </>
  );
}
