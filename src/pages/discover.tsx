import { useEffect, useMemo, useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { DiscoverMap } from "@/components/public/discover-map";
import { DiscoverList } from "@/components/public/discover-list";
import { DirectionsPanel } from "@/components/public/directions-panel";
import {
  useDiscoverFilters,
  useGlobalSearchQuery,
} from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { Coordinates } from "@/lib/discover-query";
import {
  fetchDiscoverResults,
  filterDiscoverResults,
} from "@/lib/discover-query";
import type { DiscoverResult } from "@/lib/discover-types";
import {
  DirectionsError,
  fetchRoute,
  type DirectionsErrorReason,
  type RouteGeometry,
  type TravelMode,
} from "@/lib/directions";
import { fetchActiveCategories, type PlaceCategory } from "@/lib/place-categories";
import { getCategoryIcon } from "@/lib/place-category-icons";
import { fetchActiveCategories as fetchActiveFacilities, type PlaceFacility } from "@/lib/place-facilities";
import { getFacilityIcon } from "@/lib/place-facility-icons";
import { usePageTitle } from "@/lib/page-title";

/**
 * Phase 5 (step-5-phases.md): search and list on top of Phase 4's map, one
 * screen with a toggled surface per step-5-plan.md's Shape section, not a
 * second tab or route. Owns the combined query (moved up from
 * discover-map.tsx, Phase 3.1-3.2), geolocation request (moved up from
 * discover-map.tsx, Phase 4.2), and the category/price filter state
 * (5.4, 7.1), since both the map and the list need the identical filtered
 * set and the same user location, per step-5-plan.md's "narrows both
 * map markers and the list together." Search text itself comes from
 * the shell's shared global search bar (public-shell.tsx's
 * useGlobalSearchQuery), not a page-local input.
 *
 * Drag-reveal filters: the Map/List toggle, Category filter, and Min/Max
 * price row are not always visible above the map/list. This page hands
 * its filter markup to the shell via `useDiscoverFilters` (public-shell.tsx)
 * -- the shell renders it inside the same header element the search bar
 * lives in, and owns the one drag gesture that reveals it. Search bar and
 * filters are one fused element: dragging grows the header's own height.
 * Every other tab never calls `useDiscoverFilters`, so the header there
 * has no filter area and no drag handle -- this capability exists only
 * for Discover, even though the mechanism that renders it lives in the
 * shared shell.
 *
 * The map/list itself is unaffected by any of this: it renders as
 * ordinary full-bleed content directly in this page, the same fixed
 * `<main>` region every other tab renders into (public-shell.tsx).
 *
 * locate-me-and-directions-phases.md Phase 1: userLocation can now also be
 * set by a tap on DiscoverMap's own locate-me control, via the
 * onLocationFound prop below -- setUserLocation is passed straight through,
 * not wrapped, so this stays the single source of truth the one-shot
 * geolocation effect above already established. discover-list.tsx's
 * distance sort reads the same state either way.
 */
export default function DiscoverPage() {
  usePageTitle("Discover");
  const { query } = useGlobalSearchQuery();
  // Same viewport breakpoint public-shell.tsx's own mobile/desktop shell
  // branch already uses (useIsMobile). The filter markup below is one
  // shared block registered via useDiscoverFilters for both shells (the
  // mobile drag-reveal header and the desktop side panel), but the two
  // surfaces call for different layout: mobile keeps its centered,
  // card-toned rows (the panel it renders into has no surface of its
  // own), desktop's panel already supplies its own bg-card container
  // (public-shell.tsx's DesktopShell), so a second background block plus
  // centered rows inside a fixed-width side panel would both be a
  // container-in-a-container and centered content with nothing to center
  // against -- left-aligned, full width, no extra fill, per direct
  // instruction, desktop only.
  const isMobile = useIsMobile();

  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  // Map-marker-icons-phase follow-up: DiscoverMap and DiscoverList are
  // mutually exclusive (view === "map" ? <DiscoverMap> : <DiscoverList>
  // below), so a route requested from the list view's own ResultCard has
  // no mounted map to draw onto if the route only lived inside
  // discover-map.tsx. Lifting the route here, the one place both branches
  // already share state through (userLocation is the existing precedent),
  // fixes that: DiscoverMap draws whatever's here on mount via its own
  // [route] effect, and a Directions tap from the list also flips view to
  // "map" so the drawn line is actually visible, not left on an unmounted
  // component's own state.
  const [route, setRoute] = useState<RouteGeometry | null>(null);
  // directions-panel-phases.md Phase 4.2: the result the mobile panel is
  // currently showing. Null means the panel is closed. Separate from
  // `route` itself since the panel needs the result's name for the To row
  // (directions-panel.tsx) and `route`/`RouteGeometry` carries no name,
  // only coordinates.
  const [directionsPanelResult, setDirectionsPanelResult] = useState<DiscoverResult | null>(null);
  // directions-panel-phases.md Phase 5.1: state ownership decided here
  // rather than inside directions-panel.tsx itself, matching route and
  // directionsPanelResult directly above -- discover.tsx is already the
  // one place this whole feature's state lives, so a third piece here is
  // consistent, not a new pattern. selectedMode always starts "foot",
  // matching result-card.tsx's own Phase 1.4 fetch, reset inline inside
  // handleRouteFound below each time a fresh Directions tap opens the
  // panel, so a new result never inherits a previous session's mode.
  const [selectedMode, setSelectedMode] = useState<TravelMode>("foot");
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  // Phase 5.3: guards against two mode taps racing -- a second tap while
  // one fetch is already in flight is ignored outright rather than
  // cancelled, since fetchRoute has no AbortController wiring and adding
  // one for a single-flight guard this small would be reaching past what
  // the ladder calls for. A stale response can never land after a newer
  // one this way: the second tap simply never starts a second request.
  const [modeLoading, setModeLoading] = useState(false);
  // Phase 6.2: reason for the most recent mode-switch failure, shown
  // inline in the panel's time row in place of a duration. Null means no
  // error -- cleared on every fresh fetch attempt (start of
  // handleSelectMode) and on a fresh Directions tap (handleRouteFound),
  // so a stale error from a previous mode never lingers once a new
  // attempt or a new panel session starts.
  const [modeErrorReason, setModeErrorReason] = useState<DirectionsErrorReason | null>(null);
  // Multi-select: every selected category is a match (OR), empty array is
  // the "All categories" no-op state (filterDiscoverResults' own empty-list
  // case), not "match nothing" -- widened from the original single
  // `category: string | null` per direct request.
  const [categories, setCategories] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  // 5.3: place_categories, active only, replacing the removed
  // DISCOVER_CATEGORIES constant. place-categories.ts (Phase 1.1) is
  // reused as-is -- the same fetchActiveCategories the admin Categories
  // page and admin-place-detail.tsx's own picker both already call, no
  // second fetch function written for this one caller.
  const [categoryOptions, setCategoryOptions] = useState<PlaceCategory[]>([]);

  useEffect(() => {
    fetchActiveCategories()
      .then(setCategoryOptions)
      .catch(() => setCategoryOptions([]));
  }, []);

  // Phase 2.2/2.3 (feature-request-phases.md): Facilities filter, places
  // only (2.1, confirmed against data-model.md before scoping). Multi-
  // select, same shape as `categories` above -- empty array is the no-op
  // state (filterDiscoverResults' own AND-across-selected-facilities case
  // with nothing selected matches everything), not "match nothing".
  // place-facilities.ts's fetchActiveCategories (2.2) is the same function
  // admin-place-detail.tsx's facility toggle grid already calls, aliased
  // on import to avoid colliding with the category fetch above -- no new
  // lib function written for this second caller, per constraints.md's
  // Inventory Before Suggesting rule.
  const [facilities, setFacilities] = useState<string[]>([]);
  const [facilityOptions, setFacilityOptions] = useState<PlaceFacility[]>([]);

  useEffect(() => {
    fetchActiveFacilities()
      .then(setFacilityOptions)
      .catch(() => setFacilityOptions([]));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        // Denied or unavailable: no-op, Pasig default stays in place,
        // per step-5-phases.md 4.2, geolocation here is a fallback, not a
        // required permission, so no error state blocks either surface.
      },
    );
  }, []);

  useEffect(() => {
    // Phase 8.1: the map and list both need to tell "still fetching" apart
    // from "fetched, zero results" (Phase 8.2's empty state) and from
    // "fetch failed" (Phase 8.3). One flag, read by both surfaces below,
    // since they share this single query per step-5-plan.md's "narrows
    // both... together."
    setResultsLoading(true);
    setResultsError(null);
    fetchDiscoverResults()
      .then(setResults)
      .catch((err: unknown) => {
        // Phase 8.3: a specific message, not "something went wrong," per
        // ux-ui-guidelines.md's State Rules. discover-query.ts's
        // fetchPlaces/fetchBusinesses both `throw error` straight from
        // Supabase's response, which is a PostgrestError (a plain object
        // with a .message field, not an Error subclass), so this checks
        // for that shape directly rather than `instanceof Error`. Anything
        // else (e.g. a raw network failure with no PostgrestError shape,
        // like a fetch() rejection before a response is even received)
        // falls back to one still-specific sentence naming what failed.
        const message =
          err &&
          typeof err === "object" &&
          "message" in err &&
          typeof err.message === "string"
            ? err.message
            : "Could not reach the server to load places and businesses.";
        setResultsError(message);
        setResults([]);
      })
      .finally(() => setResultsLoading(false));
  }, []);

  // Phase 7.1: raw input strings parsed to numbers at the call site, not
  // stored as numbers in state, so an in-progress edit (e.g. a lone "-" or
  // an empty field while typing) doesn't force a value before the person
  // is done. An unparseable or empty bound maps to null, filterDiscover-
  // Results' own no-op case (open-ended on that side).
  const priceRange = useMemo(() => {
    if (!minPrice && !maxPrice) return null;
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;
    return {
      min: min != null && !Number.isNaN(min) ? min : null,
      max: max != null && !Number.isNaN(max) ? max : null,
    };
  }, [minPrice, maxPrice]);

  const filtered = useMemo(
    () => filterDiscoverResults(results, query, categories, priceRange, facilities),
    [results, query, categories, priceRange, facilities],
  );

  useDiscoverFilters(
    // gap-4 (16px) between the two filter rows, py-4 (16px) top and bottom
    // of the whole panel -- both on the 8px grid per ux-ui-guidelines.md's
    // Spacing Rules. Previously each row carried its own one-sided padding
    // (pt-2 on the top row, pb-3 on the bottom row, no padding between
    // them), which left the two rows touching directly and the whole
    // panel flush against the search bar above and the drag handle below.
    // Desktop (isMobile false): no bg-background fill and no horizontal
    // padding here -- the desktop side panel (public-shell.tsx's
    // DesktopShell) already supplies its own bg-card surface and p-4
    // padding, so this would otherwise be a second background stacked
    // inside the panel's own, a container-in-a-container.
    <div className={cn("flex flex-col gap-4", isMobile ? "bg-background px-6 py-4" : "py-2")}>
      <div
        className={cn(
          "flex items-center gap-3",
          isMobile ? "mx-auto w-full max-w-md justify-center" : "w-full justify-start",
        )}
      >
        {/* Phase 5.1: map/list toggle, local component state only, no
                  second bottom-nav tab and no separate route, per step-5-plan.md
                  and step-5-phases.md 5.1. Reuses the existing Tabs primitive as
                  a segmented control (no dedicated toggle-group component exists
                  in this codebase yet, per constraints.md's Inventory Before
                  Suggesting rule); TabsContent is intentionally not used, this
                  component controls which surface renders itself so the map
                  instance stays mounted across a toggle instead of remounting.
                  Centered (justify-center) on mobile: this row now holds only
                  the toggle since the category filter moved to its own grid
                  below it, so centering here keeps it visually aligned with
                  the centered category grid and price row beneath it, rather
                  than sitting left-aligned as the sole leftover of the old
                  two-control row. Left-aligned on desktop instead, per direct
                  instruction -- the desktop panel is not a centered mobile
                  header, it's a left-side panel with its own left edge to
                  align to. */}
        <Tabs value={view} onValueChange={(v) => setView(v as "map" | "list")}>
          <TabsList>
            <TabsTrigger value="map" className="gap-1">
              <MapIcon className="h-4 w-4" />
              Map
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1">
              <List className="h-4 w-4" />
              List
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Category filter: multi-select grid of pill buttons, replacing the
                previous Select dropdown per direct request/reference image, then
                widened from single- to multi-select per a later direct request.
                Options now come from place_categories (fetchActiveCategories,
                Category Directory Phase 5.3), replacing the removed
                DISCOVER_CATEGORIES constant -- the admin-managed, active-only
                list every other category picker in this app already reads
                from, plus a leading "All categories" chip. Reuses the exact
                Button-toggle convention admin-place-detail.tsx's facilities
                field already established (variant={"default"|"outline"} keyed
                on an `active` boolean, the same shape that field already uses
                for its own genuinely multi-select case), per constraints.md's
                Inventory Before Suggesting rule, rather than inventing a new
                chip component -- only the child content changes (5.4: each
                chip's own icon, via place-category-icons.ts's getCategoryIcon,
                now renders beside its name; grid-cols-2 + rounded-full pill
                shape is unchanged).
                Filter matching itself (5.5) is unchanged: still a plain
                category-name string comparison in filterDiscoverResults
                (discover-query.ts), a business's own free-text category still
                falls back the same way it always has -- only the source list
                these chips are built from moved from a fixed constant to
                fetchActiveCategories's live rows.
                Nothing picked (categories is empty, filterDiscoverResults'
                own no-op/show-everything case) already means "no category is
                actually excluding anything," i.e. all categories match.
                The "All categories" chip was previously a toggle button that
                selected/cleared every category in one tap; since the empty
                array is already the default "all" state, that button is now a
                plain, non-interactive label instead (no onClick, no button
                semantics) rather than a control that reselects a state
                already active by default. Clicking an individual chip still
                toggles only that one category in or out of the array, never
                touching the others. */}
      <div
        className={cn(
          "flex flex-col gap-2",
          isMobile ? "mx-auto w-full max-w-md" : "w-full",
        )}
      >
        <Label className="px-1 text-sm font-normal text-muted-foreground">
          Categories
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {categoryOptions.map((c) => {
            const Icon = getCategoryIcon(c.icon);
            return (
              <Button
                key={c.id}
                type="button"
                variant={categories.includes(c.name) ? "default" : "outline"}
                className="h-11 justify-start gap-2 rounded-full px-4 font-normal"
                onClick={() =>
                  setCategories((prev) =>
                    prev.includes(c.name)
                      ? prev.filter((existing) => existing !== c.name)
                      : [...prev, c.name],
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {c.name}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Phase 2.3/2.5 (feature-request-phases.md): Facilities filter,
                same chip-toggle grid convention as the Category filter directly
                above -- grid-cols-2 + rounded-full pill shape, an "All
                facilities" lead chip mirroring "All categories", each chip
                showing its own icon beside its name (2.5) via
                place-facility-icons.ts's getFacilityIcon, the exact icon
                pairing admin-place-detail.tsx's own facility toggle grid
                already establishes for this same concept -- same icon, same
                facility, everywhere it appears, per ux-ui-guidelines.md's
                Icon Rules. Own row beneath Category rather than merged into
                it, since the two are independent filter concepts (place
                category vs. place facility) and Category's grid already
                reads as one complete unit. Places only (2.1): a business
                never carries a facility, so this row only ever narrows
                results that have somewhere to narrow. Matching itself
                (2.4) is AND, not category's OR -- see filterDiscoverResults'
                own doc comment (discover-query.ts) for why.
                Same "default already means all" logic as Category above.
                The "All facilities" chip was previously a toggle button that
                selected/cleared every facility in one tap;
                since the empty array is already the default "all" state,
                that button is now a plain, non-interactive label instead (no
                onClick, no button semantics). */}
      <div
        className={cn(
          "flex flex-col gap-2",
          isMobile ? "mx-auto w-full max-w-md" : "w-full",
        )}
      >
        <Label className="px-1 text-sm font-normal text-muted-foreground">
          Facilities
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {facilityOptions.map((f) => {
            const Icon = getFacilityIcon(f.icon);
            return (
              <Button
                key={f.id}
                type="button"
                variant={facilities.includes(f.id) ? "default" : "outline"}
                className="h-11 justify-start gap-2 rounded-full px-4 font-normal"
                onClick={() =>
                  setFacilities((prev) =>
                    prev.includes(f.id)
                      ? prev.filter((existing) => existing !== f.id)
                      : [...prev, f.id],
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {f.name}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Phase 7.1: price range filter, businesses only per step-5-plan.md
                section 3. Own row beneath the toggle/category row rather than
                crammed into it, the max-w-md mobile container (public-shell.tsx)
                doesn't have room for a third control inline without shrinking
                the existing two below a usable tap target, per ux-ui-
                guidelines.md's Responsive Rules and Component Sizing Rules.
                Plain number inputs, not a new Slider dependency, since price has
                no fixed band list to pick from (unlike category's check-
                constraint values) and a min/max pair is the native way to
                express an open-ended range, per ponytail's native-feature-first
                rung. Label text states the unit, since ₱ alone in a placeholder
                disappears once the person starts typing. */}
      <div
        className={cn(
          "flex items-end gap-3",
          isMobile
            ? "mx-auto w-full max-w-md justify-center"
            : "w-full justify-start",
        )}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="discover-price-min">Min price (₱)</Label>
          <Input
            id="discover-price-min"
            type="number"
            inputMode="numeric"
            min={0}
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="0"
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="discover-price-max">Max price (₱)</Label>
          <Input
            id="discover-price-max"
            type="number"
            inputMode="numeric"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="No limit"
            className="w-24"
          />
        </div>
      </div>
    </div>,
  );

  // directions-panel-phases.md Phase 4.1/4.2: single hand-off point for
  // both DiscoverMap's and DiscoverList's own ResultCard, so the mobile-
  // panel decision lives in exactly one place rather than duplicated
  // across both branches below.
  //
  // Phase 5.1: also resets selectedMode/routeDuration to match the fresh
  // fetch that just came in -- result-card.tsx's own fetch is always
  // "foot" (Phase 1.4, unchanged), so a new Directions tap always starts
  // the panel back on Walk with that geometry's own duration, never
  // carrying over whatever mode a previous panel session was left on.
  //
  // desktop-directions-panel-phases.md Phase 2.2: previously gated behind
  // `if (isMobile)` -- desktop's ResultCard (rendered inside
  // DiscoverMap.tsx) calls this same handler with no isMobile branch of
  // its own (result-card.tsx never had one), so gating the panel state
  // itself to mobile only meant a desktop Directions tap drew the route
  // but never set directionsPanelResult, leaving no way to open a desktop
  // panel later without duplicating this whole handler. Widened to always
  // run: the panel *state* is desktop-agnostic (matches directions-
  // panel.tsx's own variant prop being purely a rendering concern), and
  // it's the render call site below (isMobile ? DirectionsPanel
  // variant="mobile" inside this file : DirectionsPanel variant="desktop"
  // inside DiscoverMap) that actually decides whether anything shows.
  const handleRouteFound = (geometry: RouteGeometry, foundResult: DiscoverResult) => {
    setRoute(geometry);
    setDirectionsPanelResult(foundResult);
    setSelectedMode("foot");
    setRouteDuration(geometry.duration);
    // Phase 6.2: a fresh Directions tap always starts clean, even if a
    // previous panel session (for a different result, or this same one
    // reopened) was left showing a mode-switch error.
    setModeErrorReason(null);
  };

  // Phase 5.2/5.3: refetches for the tapped mode and redraws. Ignored
  // outright while a fetch is already in flight (modeLoading), and ignored
  // if userLocation or the panel's result somehow isn't set -- both are
  // guaranteed true whenever this panel is even rendered (userLocation is
  // required to reach Directions at all, per result-card.tsx's own
  // disabled-without-it button), so this is a type-narrowing guard, not a
  // reachable error path.
  //
  // Phase 6.2: on failure, sets modeErrorReason from the caught
  // DirectionsError's own `.reason` (directions.ts) -- the same
  // three-reason set result-card.tsx's Phase 3.2 branch already reads,
  // just narrowed to `.reason` instead of `.message` here since the panel
  // (directions-panel.tsx) declares its own per-reason copy rather than
  // trusting an Error's message string verbatim. A non-DirectionsError
  // throw (unexpected) falls back to "network", the same default
  // result-card.tsx's own catch block uses.
  const handleSelectMode = async (mode: TravelMode) => {
    if (modeLoading || !userLocation || !directionsPanelResult) return;
    if (mode === selectedMode) return;
    const destination = directionsPanelResult;
    if (destination.latitude == null || destination.longitude == null) return;
    setModeLoading(true);
    setModeErrorReason(null);
    try {
      const geometry = await fetchRoute(
        userLocation,
        { latitude: destination.latitude, longitude: destination.longitude },
        mode,
      );
      setSelectedMode(mode);
      setRoute(geometry);
      setRouteDuration(geometry.duration);
    } catch (err) {
      // Phase 5.3: the mode stays on whatever it was before the tap --
      // a failed switch is not a broken panel, it's an unchanged one,
      // matching the plan's "Mode switch: only one request in flight at
      // a time."
      setModeErrorReason(err instanceof DirectionsError ? err.reason : "network");
    } finally {
      setModeLoading(false);
    }
  };

  // desktop-directions-panel-phases.md Phase 2.3: extracted so both the
  // mobile panel below and the desktop panel (rendered inside
  // DiscoverMap, passed down as a prop) call the identical close logic --
  // previously this was only ever inlined once, now that a second render
  // site exists it needs to be one function, not two copies that could
  // drift.
  const handleCancelDirections = () => {
    // Phase 4.4: Cancel clears the drawn line (discover-map.tsx's
    // clearRoute, reached via route going back to null) and closes
    // the panel, in that order -- matches the plan's own Cancel
    // Behavior section. Phase 5: also resets mode/duration so a
    // future panel session never opens mid-flight or on a stale
    // mode from this one. Phase 6.2: also clears any lingering
    // mode-switch error, same reasoning.
    setRoute(null);
    setDirectionsPanelResult(null);
    setSelectedMode("foot");
    setRouteDuration(null);
    setModeErrorReason(null);
  };

  return (
    <div className="relative h-full w-full">
      {/* Phase 4.1's full-bleed, no-card-wrapper rule applies to the map
          only; the list is ordinary scrollable page content, so only the
          map branch keeps the unconstrained h-full/w-full wrapper. This
          renders directly into the shell's fixed <main> region
          (public-shell.tsx) -- the filter drag lives entirely in the
          header above and never resizes or repositions this element. */}
      {view === "map" ? (
        <DiscoverMap
          results={filtered}
          userLocation={userLocation}
          resultsLoading={resultsLoading}
          resultsError={resultsError}
          onLocationFound={setUserLocation}
          route={route}
          onRouteFound={handleRouteFound}
          // desktop-directions-panel-phases.md Phase 2.3: the desktop
          // panel lives inside DiscoverMap's own relatively-positioned
          // container (same coordinate space as ZoomControl/
          // MapCornerControls), so its state has to be threaded down as
          // props rather than rendered as a discover.tsx-level sibling
          // the way mobile's fixed panel is. DiscoverMap decides
          // internally whether to actually mount it (desktop width only,
          // directionsPanelResult non-null) -- this always passes the
          // current values down, same as any other prop.
          directionsPanelResult={directionsPanelResult}
          selectedMode={selectedMode}
          onSelectMode={handleSelectMode}
          onCancelDirections={handleCancelDirections}
          routeDuration={routeDuration}
          modeLoading={modeLoading}
          modeErrorReason={modeErrorReason}
        />
      ) : (
        <DiscoverList
          results={filtered}
          userLocation={userLocation}
          resultsLoading={resultsLoading}
          resultsError={resultsError}
          onRouteFound={(geometry, foundResult) => {
            handleRouteFound(geometry, foundResult);
            setView("map");
          }}
        />
      )}
      {/* directions-panel-phases.md Phase 4.3: sibling to the map/list
          branch above, not inside either one, so the panel survives a
          Map/List toggle instead of unmounting with whichever branch
          opened it. Mobile only -- isMobile is already read at the top of
          this component for the filter-markup branch above, reused here
          rather than a second breakpoint check. Desktop's own panel
          renders inside DiscoverMap instead (props passed above), not
          here, since it needs the map's coordinate space, not the
          viewport's. */}
      {isMobile && directionsPanelResult && (
        <DirectionsPanel
          result={directionsPanelResult}
          selectedMode={selectedMode}
          onSelectMode={handleSelectMode}
          durationSeconds={routeDuration}
          isLoading={modeLoading}
          errorReason={modeErrorReason}
          onCancel={handleCancelDirections}
        />
      )}
    </div>
  );
}
