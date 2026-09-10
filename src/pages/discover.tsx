import { useEffect, useMemo, useState } from "react";
import { List, Map as MapIcon, Search } from "lucide-react";
import { DiscoverMap } from "@/components/public/discover-map";
import { DiscoverList } from "@/components/public/discover-list";
import { useTopBarSlot } from "@/components/public/public-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Coordinates } from "@/lib/discover-query";
import { fetchDiscoverResults, filterDiscoverResults } from "@/lib/discover-query";
import { DISCOVER_CATEGORIES, type DiscoverResult } from "@/lib/discover-types";

// Sentinel for the Select's "no category filter" option: Radix's Select
// does not accept an empty string as an item value, so "all" is mapped
// back to `null` (filterDiscoverResults' no-op case) at the call site.
const ALL_CATEGORIES = "all";

/**
 * Phase 5 (step-5-phases.md): search and list on top of Phase 4's map, one
 * screen with a toggled surface per step-5-plan.md's Shape section, not a
 * second tab or route. Owns the combined query (moved up from
 * discover-map.tsx, Phase 3.1-3.2), geolocation request (moved up from
 * discover-map.tsx, Phase 4.2), and the search/category filter state
 * (5.3-5.4), since both the map and the list need the identical filtered
 * set and the same user location, per step-5-plan.md's "narrows both map
 * markers and the list together." Search bar fills the shell's existing
 * top bar slot (Phase 2.3), per ux-ui-guidelines.md's Layout Shell Rules,
 * search lives in the top bar chrome, not inside this page's own layout.
 */
export default function DiscoverPage() {
  const setTopBarContent = useTopBarSlot();

  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

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
      }
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
          err && typeof err === "object" && "message" in err && typeof err.message === "string"
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
    return { min: min != null && !Number.isNaN(min) ? min : null, max: max != null && !Number.isNaN(max) ? max : null };
  }, [minPrice, maxPrice]);

  const filtered = useMemo(
    () => filterDiscoverResults(results, query, category, priceRange),
    [results, query, category, priceRange]
  );

  // Search bar rendered into the shell's top bar (Phase 2.3's slot), only
  // while Discover is mounted. Cleared on unmount so the next tab doesn't
  // inherit it, per public-shell.tsx's own comment that every other tab
  // renders the bar title-only or empty.
  useEffect(() => {
    setTopBarContent(
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search places and businesses"
          aria-label="Search Discover"
          className="pl-9"
        />
      </div>
    );

    return () => setTopBarContent(null);
    // query/setTopBarContent intentionally both deps: the slotted input is
    // a controlled element, its value must stay in sync with this page's
    // own query state on every keystroke.
  }, [query, setTopBarContent]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-6 py-3">
        {/* Phase 5.1: map/list toggle, local component state only, no
            second bottom-nav tab and no separate route, per step-5-plan.md
            and step-5-phases.md 5.1. Reuses the existing Tabs primitive as
            a segmented control (no dedicated toggle-group component exists
            in this codebase yet, per constraints.md's Inventory Before
            Suggesting rule); TabsContent is intentionally not used, this
            component controls which surface renders itself so the map
            instance stays mounted across a toggle instead of remounting.
            shrink-0: this control's own content (two short labeled tabs)
            sets its natural minimum width, the category Select is the one
            that should give up space first at narrow widths, not this. */}
        <Tabs value={view} onValueChange={(v) => setView(v as "map" | "list")} className="shrink-0">
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

        {/* Phase 5.4: category filter, options from DISCOVER_CATEGORIES
            (discover-types.ts), the fixed list places.category's check
            constraint enforces. Applies to the combined result set, so it
            narrows both the map markers and the list together.
            Phase 8.4 fix: was a fixed `w-40` (160px), which combined with
            the Tabs control's own intrinsic width overflowed this row's
            available content width at narrow mobile viewports (320px,
            still a real device width) since flex items default to
            `min-width: auto` and refuse to shrink below their content size
            inside a `justify-between` row with no wrap. SelectTrigger's
            own base class already sets `w-full` (components/ui/select.tsx),
            so `flex-1 min-w-0` here lets it take the remaining row width
            fluidly and actually shrink, rather than holding a fixed pixel
            width past what the row has left; the Tabs control above keeps
            its natural size (`shrink-0`) since a segmented control
            collapsing its own labels would be a worse outcome than the
            Select's text simply eliding. `[&>span]:line-clamp-1` on the
            trigger clamps SelectValue's rendered span to one line with an
            ellipsis at the tightest widths (the longest options, "Heritage
            Site" and "Cultural Site", would otherwise wrap or overflow past
            the chevron icon once the trigger is this narrow); this is the
            same child-selector approach shadcn's own SelectTrigger uses by
            default in newer versions, applied locally here rather than
            edited into the shared components/ui/select.tsx primitive,
            since that file is used by every Select in the app (including
            every admin page), out of scope for a Discover-only responsive
            pass. */}
        <Select
          value={category ?? ALL_CATEGORIES}
          onValueChange={(v) => setCategory(v === ALL_CATEGORIES ? null : v)}
        >
          <SelectTrigger
            aria-label="Filter by category"
            className="min-w-0 flex-1 [&>span]:line-clamp-1"
          >
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {DISCOVER_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <div className="mx-auto flex w-full max-w-md items-end gap-3 px-6 pb-3">
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

      {/* Phase 4.1's full-bleed, no-card-wrapper rule applies to the map
          only; the list is ordinary scrollable page content, so only the
          map branch keeps the unconstrained h-full/w-full wrapper. */}
      <div className="min-h-0 flex-1">
        {view === "map" ? (
          <DiscoverMap
            results={filtered}
            userLocation={userLocation}
            resultsLoading={resultsLoading}
            resultsError={resultsError}
          />
        ) : (
          <DiscoverList
            results={filtered}
            userLocation={userLocation}
            resultsLoading={resultsLoading}
            resultsError={resultsError}
          />
        )}
      </div>
    </div>
  );
}
