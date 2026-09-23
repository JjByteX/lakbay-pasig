import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import maplibregl from "maplibre-gl";
import { LocateFixed, MapPin, Plus, Minus } from "lucide-react";
import type { Coordinates } from "@/lib/discover-query";
import { LATTE, MOCHA, buildStyle, PASIG_CENTER, DEFAULT_ZOOM } from "@/lib/map-style";
import type { DiscoverResult } from "@/lib/discover-types";
import { fetchActiveCategories, type PlaceCategory } from "@/lib/place-categories";
import { getCategoryIcon } from "@/lib/place-category-icons";
import { fetchActiveCategories as fetchActiveBusinessCategories, type BusinessCategory } from "@/lib/business-categories";
import { getBusinessCategoryIcon } from "@/lib/business-category-icons";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { RouteGeometry, TravelMode, DirectionsErrorReason } from "@/lib/directions";
import { ResultCard, VerificationBadge } from "./result-card";
import { DirectionsPanel } from "./directions-panel";
import type { CustomFrom } from "./public-shell";

// Path B (map-vector-restyle-plan.md): Path A recolored CARTO Positron
// raster tiles with a `mix-blend-mode: color` div. Positron's raster tiles
// are near-grayscale by design, so the blend had almost no color to
// preserve — confirmed against the screenshot, a flat washed-out grey, not
// Catppuccin. A filter/blend on a grayscale raster image can't invent
// per-feature color, that's a hard ceiling, not a tuning problem.
//
// Fix: vector tiles + a real style, where every feature type (water, parks,
// roads, buildings) has its own `paint` color to set directly, no blend.
// Tiles: OpenFreeMap (tiles.openfreemap.org), free, no key, no request
// limit, built on OpenStreetMap data via the OpenMapTiles schema. Base
// layer shape (source-layer names, layer list) confirmed against
// OpenFreeMap's own hosted style JSON and the upstream
// openmaptiles/positron-gl-style repo it forks, not guessed; only the
// `paint` colors below are ours, replacing Positron's own greys/blues
// with Catppuccin's real hex values, one per feature type. Renderer is
// maplibre-gl directly (no react-maplibre wrapper) since this component
// already needs the same kind of imperative instance access
// react-leaflet's useMap gave the old version (RecenterOnLocation,
// TileLoadIndicator), and one fewer dependency is the lazier fit here.
//
// Pre-step-7 cleanup: react-leaflet/leaflet are no longer installed
// anywhere in the project (previously deferred as map-vector-restyle-
// plan.md's own Open Item, resolved separately, see main.tsx). This file
// was already maplibre-gl only before that removal, so nothing here
// changes behavior, the note above is now historical context for why
// maplibre-gl was chosen, not a live scoping boundary.

// Marker name labels (markerElement below) are priority-gated by zoom
// rather than an all-or-nothing cutoff, since this city is dense enough
// that labeling every result at once can overlap regardless of zoom.
// True per-pixel collision detection (hide/show individual labels based
// on their live on-screen bounding boxes against every other visible
// label) is how map products like Google/Apple Maps actually solve this,
// but this app's markers are plain DOM elements (maplibregl.Marker with a
// custom HTMLElement, not a MapLibre symbol layer), which has no built-in
// collision engine to lean on -- building that from scratch is real scope
// (re-run on every pan/zoom, read every marker's live screen rect, resolve
// overlaps), not a safe drop-in for this pass.
// Priority instead: verified results (the ones a user is meant to trust
// and actually visit) get labeled first, pending ones only once zoomed in
// enough that they're naturally spread apart. Both tiers still respect an
// overall minimum zoom -- zoomed all the way out over the whole metro,
// even verified-only labels would be too dense to read.
const MARKER_LABEL_MIN_ZOOM_VERIFIED = 14;
const MARKER_LABEL_MIN_ZOOM_PENDING = 16;
// locate-me-and-directions-phases.md Phase 3.5: one GeoJSON source/line
// layer pair, added and removed imperatively, the same shape buildStyle
// already uses for the waterway layer -- no new rendering library.
const ROUTE_SOURCE_ID = "directions-route";
const ROUTE_LAYER_ID = "directions-route-line";

// Map-marker-icons phase: replaces the old plain verified/pending dot with
// the place or business's own category icon, same getCategoryIcon/
// getBusinessCategoryIcon lookups LegendPanel already uses for the exact
// same category value below, so a marker's glyph always matches its own
// legend row. LucideIcon is a React component, and maplibregl.Marker takes
// a raw DOM element, not JSX -- renderToStaticMarkup (react-dom/server,
// safe to call client-side, no server round trip) turns the icon into an
// SVG string once per marker build, then that markup is set directly on a
// plain div, keeping this function's own signature (HTMLElement in,
// nothing React-render-tree-aware needed by the caller) unchanged.
//
// Verification status still needs to read at a glance without a tap, per
// the original two-dot marker's whole purpose, so it moves to the ring
// around the icon instead of being the marker's only signal: a solid
// primary-token ring for verified, a dashed muted-foreground ring for
// pending, the same two tokens (bg-primary / bg-muted-foreground) the old
// dot used, now as border-color rather than fill.
//
// Name label: the icon ring alone only identified a result's category, not
// which specific place/business it was, without a tap or hover -- a
// direct request asked for the name to sit right next to the icon,
// always visible on the map like a standard map-pin label, not only on
// hover (the existing HoverPreview is desktop-only and already covers the
// richer on-hover case; this label is the always-on name, both surfaces
// can coexist). Returns a wrapper span (icon ring + text) instead of just
// the ring so the whole row is one marker element/click+hover target, per
// maplibregl.Marker's one-DOM-element-per-marker API -- nothing below this
// function needs to change since callers only ever read the returned
// element, never its internal shape.
function markerElement(result: DiscoverResult): HTMLElement {
  const Icon =
    result.kind === "place"
      ? getCategoryIcon(result.categoryIcon ?? "")
      : getBusinessCategoryIcon(result.categoryIcon ?? "");
  const wrapper = document.createElement("span");
  // Bug fix / direct instruction: gap-1.5 (6px) read as "too far" between
  // the icon ring and its name label -- tightened to gap-1 (4px), the
  // smallest step on this codebase's 8px-grid-derived spacing scale still
  // available as a plain gap utility, so the label reads as attached to
  // its own icon rather than floating near it.
  wrapper.className = "flex cursor-pointer items-center gap-1";

  const ring = document.createElement("span");
  ring.className =
    result.verification_status === "pending"
      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground bg-card shadow"
      : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-card shadow";
  ring.innerHTML = renderToStaticMarkup(<Icon className="h-4 w-4 text-foreground" aria-hidden="true" />);
  wrapper.appendChild(ring);

  const label = document.createElement("span");
  // Bug fix / direct instruction: dropped the pill container entirely
  // (previously rounded-full border border-border bg-card ... shadow, the
  // same pill/badge treatment as a status chip) -- plain text now, no
  // background, no border, no shadow, per direct instruction to remove
  // the container completely. Legibility over the map's own varied tile
  // colors, now that there's no opaque backing behind it, comes from a
  // text-shadow outline -- moved to index.css's `.marker-name-label`
  // rule (theme-scoped light/dark pair) rather than set inline here,
  // since a single fixed shadow color read fine on Mocha tiles but
  // washed out on Latte's light ones; see that CSS block's own comment
  // for why the color has to flip with the theme, not just tune darker
  // or lighter.
  label.className = "marker-name-label whitespace-nowrap text-xs font-medium text-foreground";
  // Read by the zoom-gated visibility effect below to apply the right
  // per-tier minimum zoom (verified vs. pending) to this specific label,
  // without needing a second lookup back into `results` at visibility-
  // check time.
  label.dataset.verificationStatus = result.verification_status;
  label.textContent = result.name;
  wrapper.appendChild(label);

  return wrapper;
}

interface DiscoverMapProps {
  results: DiscoverResult[];
  // The live GPS fix. Drives the blue dot and the recenter effect below --
  // both stay on the live position even when a custom From is set (the
  // dot should keep tracking where the person actually is).
  userLocation: Coordinates | null;
  // directions-distance-and-from-phases.md Phase 3.2: the route origin from
  // the shell's directions state (customFrom?.coordinates ?? userLocation).
  // Added beside userLocation, not in place of it. Handed only to this
  // file's ResultCard, so a custom From unlocks Directions from a map
  // marker tap with no GPS fix.
  origin: Coordinates | null;
  // directions-distance-and-from-phases.md Phase 5.1: the custom From
  // (drawn as the start pin, and the reason the GPS recenter below stands
  // down), the pick-mode flag (arms the one-tap click listener), and the
  // tap's callback. onMapPick's optional name is a tapped place marker's
  // own name (open-questions.md Resolved #9); the shell picks the label.
  customFrom: CustomFrom | null;
  pickingOnMap: boolean;
  onMapPick: (coordinates: Coordinates, name?: string) => void;
  resultsLoading: boolean;
  resultsError: string | null;
  // Locate-me-and-directions-plan.md Part 1: lets a tap on the locate
  // control update discover.tsx's own userLocation state (same setter its
  // one-shot geolocation effect already uses), so this file never owns a
  // second copy of the coordinate -- discover-list.tsx's distance sort
  // stays in sync with whatever the button just set. Optional so this
  // component still type-checks for any other future caller that has no
  // locate button to wire up.
  onLocationFound?: (coords: Coordinates) => void;
  // Map-marker-icons-phase follow-up: route now lives in discover.tsx, not
  // only in this component's own internal ref, since DiscoverList's own
  // ResultCard can also produce a route while this component isn't even
  // mounted. Passed in so a fresh mount (switching back from list view)
  // draws whatever discover.tsx is already holding, via the effect below.
  route: RouteGeometry | null;
  // Replaces the old internal-only onRouteFound wiring to this file's own
  // ResultCard -- now hands the geometry up to discover.tsx's setRoute so
  // both DiscoverMap and DiscoverList read and write the same one value.
  // directions-panel-phases.md Phase 4.2: result is now included alongside
  // geometry (result-card.tsx's own widened signature), passed straight
  // through to discover.tsx unchanged -- this file has no reason to read
  // it itself, its own drawRoute call still only ever reads `route`.
  onRouteFound: (geometry: RouteGeometry, result: DiscoverResult) => void;
  // desktop-directions-panel-phases.md Phase 2.3: the desktop directions
  // panel renders inside this component (not as a discover.tsx-level
  // sibling like mobile's fixed panel) since it needs to be `absolute`
  // within this file's own relatively-positioned container -- the same
  // coordinate space ZoomControl/MapCornerControls already use, floating
  // over the map rather than the viewport. All six props mirror
  // directions-panel.tsx's own DirectionsPanelProps one-for-one (minus
  // `variant`, fixed to "desktop" below); discover.tsx owns every value,
  // this file only threads them into the same DirectionsPanel component
  // mobile's own render branch already uses. directionsPanelResult null
  // means nothing to show -- the same "panel closed" signal
  // discover.tsx's own mobile branch already reads.
  directionsPanelResult: DiscoverResult | null;
  selectedMode: TravelMode;
  onSelectMode: (mode: TravelMode) => void;
  onCancelDirections: () => void;
  routeDuration: number | null;
  // directions-distance-and-from-phases.md Phase 1.4: mirrors routeDuration
  // above one-for-one, threaded straight through to the desktop
  // DirectionsPanel below same as every other directions prop here.
  routeDistance: number | null;
  modeLoading: boolean;
  modeErrorReason: DirectionsErrorReason | null;
  // directions-distance-and-from-phases.md Phase 4.7: the custom From's
  // label and handlers, threaded straight through to the desktop
  // DirectionsPanel, same as every other directions prop above -- this
  // file reads none of them itself in Phase 4. Six props on top of the
  // existing list is long, but a wrapper object was not asked for in this
  // change (Phase 4.7). Flagged for a later cleanup instead.
  //
  //
  // Phase 5.1: this file now also reads three of them itself -- customFrom
  // (to draw the start pin), pickingOnMap (to arm the click listener) and
  // onMapPick (the tap's callback) -- so they are declared just below,
  // beside userLocation/origin, where the map-owned props live.
  //
  // ponytail: eight flat From props now. Group them into one
  // `fromControl` object if a third DirectionsPanel host appears, or the
  // next From feature adds another. Not done here: a wrapper object was
  // not asked for in this change (Phase 4.7).
  fromLabel: string | null;
  onSelectFrom: (from: CustomFrom) => void;
  onResetFrom: () => void;
  onPickOnMap: () => void;
  onCancelPickOnMap: () => void;
}

// Feature-request-phases.md Phase 1.1/1.4: legend content (categories +
// status key) rendered as a dropdown panel, opened from the combined
// corner pill below (MapCornerControls), not this component's own button
// -- merged per direct instruction so the legend toggle and the locate
// control live in one stacked pill instead of two separate floating
// circles.
//
// Map-marker-icons phase: markers no longer draw a plain verified/pending
// dot -- markerElement above now draws the place or business's own
// category icon inside a ring, solid-primary for verified, dashed-muted-
// foreground for pending. The Status swatches below were updated to match
// (a small ring, not a filled dot), so 1.4's own rule still holds: no
// marker style should exist without an entry a user can look up, and that
// entry should look like what's actually on the map. Category rows
// underneath were already icon+label pairs before this phase (1.1's reuse
// instruction, same getCategoryIcon/getBusinessCategoryIcon lookups the
// marker itself now also calls) -- what changed is that the marker finally
// draws that same icon too, closing the gap the original comment here
// flagged ("no per-category marker color or icon exists" is no longer
// true).
//
// 1.1: icons for place categories/business categories are looked up via
// the exact same getCategoryIcon/getBusinessCategoryIcon lookups
// discover.tsx's own filter chips already call, no new icon map. Business
// *category* (business_categories, icon-bearing, already the concept
// backing Discover's own category filter chips per business-fields.tsx's
// "Groups the listing under Discover's category filters") is used here for
// the "business type" row per 1.2's wording -- business_type (Product/
// Service/Both, business-fields.tsx) is a different field with no icon
// anywhere in this codebase and is never read anywhere in Discover
// (DiscoverBusiness carries no business_type field at all, confirmed by
// grep), so it has nothing this legend could pair an icon with. Flagged
// here rather than silently guessed, per constraints.md's No Silent
// Overrides rule.
function LegendPanel({
  placeCategories,
  businessCategories,
  loading,
}: Readonly<{
  placeCategories: PlaceCategory[];
  businessCategories: BusinessCategory[];
  loading: boolean;
}>) {
  // 1.8: hidden cleanly rather than showing an empty panel once opened, if
  // there is nothing to show yet (a request still in flight and no rows
  // fetched, matching discover.tsx's own categoryOptions/facilityOptions
  // fetch-failure fallback of an empty array -- an empty legend body is
  // itself the correct "zero results" case, no separate error path needed
  // for a small reference list per 1.8's own "stay hidden cleanly" wording).
  const isEmpty = !loading && placeCategories.length === 0 && businessCategories.length === 0;
  if (isEmpty) return null;

  return (
    // Plain absolutely-positioned panel, not the Radix DropdownMenu
    // primitive (components/ui/dropdown-menu.tsx) -- same reasoning
    // global-search-bar.tsx's own header comment already gives for its own
    // dropdown: no Popover/Command primitive exists in this codebase
    // (grepped src/components/ui first, per constraints.md's Inventory
    // Before Suggesting rule), and this needs no trigger-click focus
    // trapping, just a plain panel toggled by the pill beneath it. max-h +
    // overflow so a long category list never grows the panel past the
    // map's own viewport, matching the search bar's own max-h-[70vh]
    // pattern for the same "don't outgrow the container" reason (1.9's
    // 320px/overlap pass). Opens downward from the pill now that the pill
    // itself sits top-right (mt-2 gap instead of the old bottom-left
    // upward-opening layout).
    <div className="absolute right-0 top-full mt-2 max-h-[60vh] w-56 overflow-y-auto rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md">
      <p className="mb-2 text-sm font-semibold text-foreground">Legend</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </p>
          <div className="flex items-center gap-2">
            <span className="block h-4 w-4 shrink-0 rounded-full border-2 border-primary bg-card shadow" />
            <span className="text-sm text-foreground">Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="block h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-muted-foreground bg-card shadow" />
            <span className="text-sm text-foreground">Pending Verification</span>
          </div>
        </div>

        {placeCategories.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Place Categories
            </p>
            {placeCategories.map((c) => {
              const Icon = getCategoryIcon(c.icon);
              return (
                <div key={c.id} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-foreground" />
                  <span className="text-sm text-foreground">{c.name}</span>
                </div>
              );
            })}
          </div>
        )}

        {businessCategories.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Business Categories
            </p>
            {businessCategories.map((c) => {
              const Icon = getBusinessCategoryIcon(c.icon);
              return (
                <div key={c.id} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-foreground" />
                  <span className="text-sm text-foreground">{c.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Combines the old separate MapLegend toggle and LocateMeControl into one
// stacked pill, per direct instruction and reference image: a single
// rounded rectangle, map/legend icon on top, locate arrow below, divided
// by a thin line -- not two separate floating circles.
//
// Placement: top-right, inside this component's own relative container
// (same coordinate space the bottom corner controls already use), not
// bottom-right/bottom-left like the two originals. public-shell.tsx's
// header is a fixed h-14 (56px) row at rest, and <main> (where this map
// renders) starts exactly at that same top-14 offset, so this control
// sits clearly under the search bar, never behind it, in the header's
// normal (non-dragged) state. The header's filter drawer can grow taller
// than h-14 while being actively dragged open (public-shell.tsx's own
// HeaderFilterArea, a temporary user-held gesture, not the map's resting
// view), which this fixed offset does not chase -- no shared header-height
// value exists to read here (grepped public-shell.tsx first), and the
// drawer's own existing overlap-while-dragging behavior is already
// accepted elsewhere in this shell (its own comment: "the header simply
// grows over top of this fixed layer").
//
// top-14 rather than top-6: this container also renders the status/
// loading/error pills (resultsError/resultsLoading/tilesLoading/isEmpty,
// below), horizontally centered at top-6 (nudged down from top-3 so they
// clear the header's search bar instead of sitting right behind it) with
// max-w-full text that can run wide enough to reach this corner on
// narrower viewports -- top-14 clears that row entirely so the corner
// pill and a centered status message never visually collide.
function MapCornerControls({
  placeCategories,
  businessCategories,
  categoriesLoading,
  onLocationFound,
  onRecenterRequested,
}: Readonly<{
  placeCategories: PlaceCategory[];
  businessCategories: BusinessCategory[];
  categoriesLoading: boolean;
  onLocationFound?: (coords: Coordinates) => void;
  // Bugfix (map snaps back while panning): a locate tap should recenter
  // the camera exactly once, not keep pulling it back on every later
  // background GPS tick. onLocationFound above still just updates the
  // shared coordinate (for the blue dot / distance sort); this separate
  // callback is the one-shot "please recenter now" signal, fired only
  // from this tap handler -- see the recenter effect below for the other
  // half (it now keys off this signal instead of onLocationFound's
  // coordinate). Optional for the same reason onLocationFound is.
  onRecenterRequested?: () => void;
}>) {
  const [legendOpen, setLegendOpen] = useState(false);
  const [locateStatus, setLocateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [locateError, setLocateError] = useState<string | null>(null);

  const handleLocate = () => {
    if (!onLocationFound) return;
    if (!navigator.geolocation) {
      setLocateStatus("error");
      setLocateError("Location isn't supported on this device.");
      return;
    }
    setLocateStatus("loading");
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocateStatus("idle");
        onLocationFound({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          // google-style-location-heading-indicator: same field the
          // shell's own watchPosition now populates (public-shell.tsx),
          // so a locate-me tap doesn't regress the marker back to "no
          // heading" if the device happens to report one on this read.
          heading: position.coords.heading,
        });
        // One-shot recenter: this tap, and only this tap, should move
        // the camera. Fired after the coordinate update above so the
        // recenter effect sees the fresh position on the same tick.
        onRecenterRequested?.();
      },
      (err) => {
        setLocateStatus("error");
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Enable it in your browser settings to use this."
            : "Couldn't get your location. Try again.",
        );
      },
    );
  };

  return (
    <div className="absolute right-3 top-14 z-[1000] flex flex-col items-end gap-2">
      <div className="relative flex flex-col items-center rounded-2xl border border-input bg-card shadow">
        {/* 1.8: disabled with a muted icon while categories are still
            resolving, same "visibly disabled, not silently unresponsive"
            shape ux-ui-guidelines.md's State Rules require for a loading
            control -- the button itself is the loading indicator here, a
            separate spinner would be a second element for one small toggle. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-t-2xl rounded-b-none hover:bg-muted"
          aria-label={legendOpen ? "Hide legend" : "Show legend"}
          onClick={() => setLegendOpen((v) => !v)}
          disabled={categoriesLoading}
        >
          <MapPin className={categoriesLoading ? "h-4 w-4 text-muted-foreground" : "h-4 w-4"} />
        </Button>
        <Separator className="w-6" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-b-2xl rounded-t-none hover:bg-muted"
          aria-label="Find my location"
          onClick={handleLocate}
          disabled={locateStatus === "loading"}
        >
          <LocateFixed
            className={locateStatus === "loading" ? "h-4 w-4 animate-spin text-muted-foreground" : "h-4 w-4"}
          />
        </Button>

        {legendOpen && (
          <LegendPanel
            placeCategories={placeCategories}
            businessCategories={businessCategories}
            loading={categoriesLoading}
          />
        )}
      </div>

      {locateStatus === "error" && locateError && (
        <span className="max-w-56 break-words rounded-md border border-border bg-card px-3 py-1.5 text-right text-xs text-destructive shadow">
          {locateError}
        </span>
      )}
    </div>
  );
}

// Desktop zoom control, bottom-right per direct instruction/reference
// screenshot: a stacked +/- pill, same two-button-in-a-rounded-container
// convention MapCornerControls above already establishes (Separator
// between two ghost icon Buttons, rounded-t-2xl on the first, rounded-
// b-2xl on the last) rather than inventing a second pill shape -- only
// the icons (Plus/Minus, not MapPin/LocateFixed), position (bottom-right,
// not top-right), and action (zoomIn/zoomOut on the live map instance,
// not a geolocation call) differ. Desktop-only: mobile MapLibre already
// exposes pinch-to-zoom as its native gesture, and a floating thumb-zone
// control in the bottom-right corner of a touch viewport would sit
// under/near the same area other touch chrome (browser nav, home
// indicator) already occupies -- matching this file's own MapCornerControls,
// LocateMeControl reasoning for other controls staying off mobile.
// Reads getZoom()/zoomIn()/zoomOut() straight off the same mapRef the
// rest of this component already owns, since this is the one component
// with direct access to the live map instance -- no separate map
// reference is created for this control.
function ZoomControl({ map }: Readonly<{ map: maplibregl.Map | null }>) {
  const [zoom, setZoom] = useState<number | null>(null);

  // Mirrors MapCornerControls' own MutationObserver-free, event-driven
  // pattern: reads the map's live zoom on "zoom" so the buttons can
  // disable at MapLibre's own min/max bounds (buildStyle sets neither
  // explicitly, so this falls back to maplibre-gl's own default 0-22
  // range) instead of silently no-opping past either end, same "visibly
  // disabled, not silently unresponsive" rule MapCornerControls' own
  // legend toggle already follows for its own loading state.
  useEffect(() => {
    if (!map) return;
    const updateZoom = () => setZoom(map.getZoom());
    updateZoom();
    map.on("zoom", updateZoom);
    return () => {
      map.off("zoom", updateZoom);
    };
  }, [map]);

  const maxZoom = map?.getMaxZoom() ?? 22;
  const minZoom = map?.getMinZoom() ?? 0;
  const atMax = zoom != null && zoom >= maxZoom;
  const atMin = zoom != null && zoom <= minZoom;

  return (
    <div className="absolute bottom-6 right-3 z-[1000] hidden flex-col items-center rounded-2xl border border-input bg-card shadow md:flex">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-t-2xl rounded-b-none hover:bg-muted"
        aria-label="Zoom in"
        onClick={() => map?.zoomIn()}
        disabled={!map || atMax}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Separator className="w-6" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-b-2xl rounded-t-none hover:bg-muted"
        aria-label="Zoom out"
        onClick={() => map?.zoomOut()}
        disabled={!map || atMin}
      >
        <Minus className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Phase 1.5-1.7: hover preview, desktop only (1.6's "hover has no mobile
// equivalent"), reusing result-card.tsx's own summary fields (name,
// category, verification label, one-line description) rather than a new
// layout, per 1.6's explicit instruction. Positioned near the cursor
// (1.6), dismissed on mouse leave -- a click/tap still opens the existing
// ResultCard modal via the marker's own click handler, unchanged, per
// 1.7's "hover never replaces the existing tap flow."
//
// Map hover photo phase: cover photo added as a fixed-size thumbnail on
// the left (direct instruction: "show one picture on the left of the
// hover modal"), text stacked on the right in a second column -- a row
// layout rather than the old single stacked column, since a photo and a
// name/category/description block read naturally as side-by-side content,
// not as one on top of the other. `result.coverPhotoUrl`
// (discover-query.ts's fetchPlaces/fetchBusinesses, backed by
// place_photos/business_photos via home-query.ts's fetchCoverPhotoUrls)
// is the same lowest-sort_order photo already shown first everywhere else
// a single representative image is needed (Home's CategoryPhotoRow). No
// photo yet is a plain muted square, same empty-photo convention
// discover-business-detail.tsx's item cards already use, not an invented
// placeholder icon.
function HoverPreview({
  result,
  x,
  y,
}: Readonly<{ result: DiscoverResult; x: number; y: number }>) {
  return (
    <div
      className="pointer-events-none absolute z-[1000] flex w-80 gap-3 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
      style={{ left: x + 12, top: y + 12 }}
    >
      {result.coverPhotoUrl ? (
        <img
          src={result.coverPhotoUrl}
          alt=""
          className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <div className="h-20 w-20 shrink-0 rounded-md border border-border bg-muted" />
      )}
      <div className="flex min-w-0 flex-col">
        <p className="text-sm font-semibold text-foreground">{result.name}</p>
        <p className="text-xs text-muted-foreground">{result.category}</p>
        {result.description && (
          <p className="mt-1 line-clamp-3 text-xs text-foreground">{result.description}</p>
        )}
        <div className="mt-2">
          <VerificationBadge status={result.verification_status} />
        </div>
      </div>
    </div>
  );
}

/**
 * Phase 4.1-4.4, controlled since Phase 5 (see architecture-notes.md for the
 * full history of this component). Map view, full-bleed under the shell's
 * top bar, no card wrapper. Centered on Pasig by default, recenters on
 * `userLocation` once resolved. Renders one marker per result, verified vs
 * pending treatments, tapping a marker opens the shared ResultCard.
 *
 * map-vector-restyle-plan.md (Path B): tile source is now OpenFreeMap
 * vector tiles rendered through maplibre-gl, replacing react-leaflet +
 * CARTO raster tiles. Recolored with real Catppuccin paint values per
 * feature type (see buildStyle in map-style.ts), not a CSS blend. Prop contract
 * (results/userLocation/resultsLoading/resultsError) is unchanged, so
 * discover.tsx needs no changes to call this component.
 *
 * Feature-request-phases.md Phase 1: adds a collapsed legend control
 * (MapLegend above, 1.2-1.3) and a desktop-only hover preview (HoverPreview
 * above, 1.5-1.7). Both are additive to this component's own props/behavior
 * -- no schema change, discover.tsx still calls this component with the
 * exact same four props it always has, per this phase's own "isolated to
 * Discover's map" scope.
 *
 * locate-me-and-directions-phases.md Phase 1: adds a fifth, optional prop
 * (onLocationFound) and a bottom-right LocateMeControl (above) that calls
 * it on a successful geolocation read. No new userLocation state lives
 * here -- discover.tsx's existing setUserLocation is passed straight
 * through, so the existing userLocation recenter effect below already
 * handles the camera move, whether the coordinate came from page load or
 * this button.
 *
 * locate-me-and-directions-phases.md Phase 3: ResultCard now also receives
 * userLocation and onRouteFound. This file still owns the one map instance
 * and the one GeoJSON source/line-layer pattern (matching buildStyle's own
 * waterway layer), so a route fetched inside this component's own popup is
 * drawn here, not inside result-card.tsx, which has no map reference of
 * its own.
 *
 * Map-marker-icons-phase follow-up: route and onRouteFound are now props
 * from discover.tsx rather than state local to this component, since
 * discover-list.tsx's own ResultCard can also produce a route while this
 * component isn't mounted at all (view toggle in discover.tsx renders one
 * or the other, never both). drawRoute below reads the `route` prop on
 * mount and on every change, so switching back to map view after a
 * Directions tap from the list still shows the line.
 *
 * Combined-corner-controls follow-up: MapLegend and LocateMeControl merged
 * into one MapCornerControls component (below), rendered as a single
 * stacked pill (legend toggle on top, locate arrow beneath, divided by a
 * Separator) per direct instruction and reference image, instead of two
 * separate floating circles. Moved from bottom-left/bottom-right to
 * top-right, positioned to clear the header's search bar rather than sit
 * behind it -- see MapCornerControls' own comment for the exact offset
 * reasoning against public-shell.tsx's fixed header height.
 */
export function DiscoverMap({
  results,
  userLocation,
  origin,
  customFrom,
  pickingOnMap,
  onMapPick,
  resultsLoading,
  resultsError,
  onLocationFound,
  route,
  onRouteFound,
  directionsPanelResult,
  selectedMode,
  onSelectMode,
  onCancelDirections,
  routeDuration,
  routeDistance,
  modeLoading,
  modeErrorReason,
  fromLabel,
  onSelectFrom,
  onResetFrom,
  onPickOnMap,
  onCancelPickOnMap,
}: Readonly<DiscoverMapProps>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selected, setSelected] = useState<DiscoverResult | null>(null);
  const [tilesLoading, setTilesLoading] = useState(true);
  const isEmpty = !resultsError && !resultsLoading && !tilesLoading && results.length === 0;

  // Zoom control: mapRef alone can't drive ZoomControl's `map` prop below
  // -- refs don't trigger a re-render when written, so a value set inside
  // the mount effect (mapRef.current = map) would never actually reach a
  // prop until something else happened to re-render this component for
  // an unrelated reason. mapInstance is state purely to carry that one
  // assignment across the render boundary once, set alongside mapRef in
  // the same mount effect below, read only by the ZoomControl prop at
  // the bottom of this file's return.
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);

  // Bugfix (directions route not appearing): drawRoute below bails out
  // silently when map.isStyleLoaded() is false, which it reliably is for
  // a brief window right after `new maplibregl.Map(...)` -- the vector
  // style is an async fetch (tiles.openfreemap.org), not ready synchronously.
  // The only retry path used to be a "style.load" listener attached in a
  // *separate* effect, which only fires again on a later setStyle() (dark/
  // light toggle) -- it does not reliably cover the initial load on a
  // fresh mount, which is exactly the case that matters here: switching
  // from list view to map view after a Directions tap unmounts and
  // remounts this whole component with `route` already set, so the very
  // first draw attempt is also the only one that was going to happen.
  // styleReady tracks actual readiness in state instead of leaning on a
  // side-channel event listener that can race the map's own construction,
  // so the route-draw effect below can depend on it directly and re-run
  // deterministically once the map is truly able to accept a source/layer.
  const [styleReady, setStyleReady] = useState(false);

  // Phase 1.1: same fetchActiveCategories/getCategoryIcon calls discover.tsx's
  // own filter chips already make, independent effects (mirroring
  // discover.tsx's own two separate category/facility effects) so one
  // list's fetch failure doesn't blank the other -- each falls back to an
  // empty array on error, same fallback shape discover.tsx's own two fetch
  // effects already use, so the legend simply shows fewer rows rather than
  // an error state for what is reference content, not a required control.
  const [placeCategories, setPlaceCategories] = useState<PlaceCategory[]>([]);
  const [businessCategories, setBusinessCategories] = useState<BusinessCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    let placesDone = false;
    let businessesDone = false;
    const checkDone = () => {
      if (placesDone && businessesDone) setCategoriesLoading(false);
    };
    fetchActiveCategories()
      .then(setPlaceCategories)
      .catch(() => setPlaceCategories([]))
      .finally(() => {
        placesDone = true;
        checkDone();
      });
    fetchActiveBusinessCategories()
      .then(setBusinessCategories)
      .catch(() => setBusinessCategories([]))
      .finally(() => {
        businessesDone = true;
        checkDone();
      });
  }, []);

  // Phase 1.6: desktop only, "hover has no mobile equivalent" -- reuses the
  // existing useIsMobile hook (hooks/use-mobile.tsx) rather than a new
  // pointer-media-query check, per constraints.md's Inventory Before
  // Suggesting rule. hovered holds both the result and the last known
  // pointer position so HoverPreview can follow the cursor without a
  // second piece of state.
  const isMobile = useIsMobile();
  const [hovered, setHovered] = useState<{ result: DiscoverResult; x: number; y: number } | null>(null);

  // Map instance: created once, destroyed on unmount. Dark/light palette is
  // read once at creation via the `.dark` class on <html> (this codebase's
  // existing dark-mode strategy, tailwind.config.ts's `darkMode: ["class"]`)
  // and re-applied via setStyle if that class changes later, watched with a
  // MutationObserver since there's no app-level theme context to subscribe
  // to yet (grepped, none exists).
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = () => document.documentElement.classList.contains("dark");
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(isDark() ? MOCHA : LATTE),
      center: [PASIG_CENTER.longitude, PASIG_CENTER.latitude],
      zoom: DEFAULT_ZOOM,
      attributionControl: {
        // locate-me-and-directions-phases.md Phase 3.8: OSRM/OSM ODbL credit
        // added as one more clause in this same string, not a second
        // attribution control, per the plan's explicit instruction.
        //
        // Bugfix (Car/Bike/Walk all returned the same route): directions.ts
        // now routes through FOSSGIS's servers, whose usage policy requires
        // both a credit and a "fix the map" link. Both added as further
        // clauses in this same string, same reason as above -- one control,
        // not a second one stacked in the corner.
        customAttribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, <a href="https://openfreemap.org">OpenFreeMap</a>, <a href="https://project-osrm.org">OSRM</a>, routing by <a href="https://www.fossgis.de/">FOSSGIS</a>, <a href="https://www.openstreetmap.org/fixthemap">fix the map</a>',
      },
    });
    mapRef.current = map;
    // Zoom control: see mapInstance's own declaration comment above --
    // this is the one write that carries the map instance across a
    // render boundary so ZoomControl's prop actually receives it.
    setMapInstance(map);

    // Phase 8.1 parity: tiles are their own loading concern, separate from
    // the results query. MapLibre's "load" fires once the initial style +
    // visible tiles are ready; "dataloading"/"idle" cover later pan/zoom
    // tile fetches, mirroring the old TileLoadIndicator's
    // loading/load/whenReady trio (no whenReady equivalent needed here:
    // unlike Leaflet, attaching "load" after MapLibre's own constructor-
    // driven initial load is not a race, the listener is attached
    // synchronously in this same effect, before the browser yields).
    //
    // Bugfix (trail/route line still vanishing after leaving and
    // returning to Discover -- via "view full details" *or* any other
    // tab, e.g. Trails/Saved/Home): the previous fix flipped styleReady
    // true from whichever of "load"/"idle"/"style.load" fired first, on
    // the assumption that if the event fired, the style must be ready.
    // That assumption is the actual bug -- MapLibre can emit these events
    // a tick before map.isStyleLoaded() itself flips true internally, so
    // styleReady went true, the [route, styleReady] effect below ran
    // once, drawRoute's own `if (!map.isStyleLoaded()) return` guard
    // silently bailed out on that one real style-not-ready tick, and
    // nothing was left to ever call drawRoute again -- styleReady was
    // already true (no further state change) and route hadn't changed,
    // so the effect had no reason to re-run. The route source/layer were
    // simply never created on that mount; the popup (driven by shell
    // state, not this component) had nothing to do with it, so it kept
    // showing correctly while the line silently never got drawn.
    //
    // Fixed by trusting map.isStyleLoaded() itself, not the event's mere
    // firing, and retrying with rAF until it's genuinely true instead of
    // taking one shot. markStyleReady below is called from every
    // candidate event and only ever *commits* styleReady=true once
    // isStyleLoaded() actually agrees -- if it doesn't yet, it reschedules
    // itself on the next animation frame (cheap: this only runs during
    // the brief not-yet-ready window right after mount/setStyle, not on
    // every idle tick once ready) rather than trusting a single check.
    let pending = false;
    let rafId: number | null = null;
    const markStyleReady = () => {
      if (map.isStyleLoaded()) {
        pending = false;
        setStyleReady(true);
        return;
      }
      // Not ready yet on this tick -- one retry loop at a time so a burst
      // of "load"/"idle"/"style.load" firing close together doesn't stack
      // duplicate rAF chains.
      if (pending) return;
      pending = true;
      const check = () => {
        if (map.isStyleLoaded()) {
          pending = false;
          setStyleReady(true);
          return;
        }
        rafId = requestAnimationFrame(check);
      };
      rafId = requestAnimationFrame(check);
    };
    const handleLoad = () => {
      setTilesLoading(false);
      markStyleReady();
    };
    const handleDataLoading = () => setTilesLoading(true);
    map.on("load", handleLoad);
    map.on("dataloading", handleDataLoading);
    map.on("idle", handleLoad);

    // Bugfix (directions route not appearing): styleReady is this map
    // instance's own readiness flag, reset false up front (a fresh mount,
    // e.g. after switching from list view, starts not-ready even though
    // the previous instance may have finished loading) and flipped true
    // once map.isStyleLoaded() genuinely agrees, on "style.load" (which
    // fires both for this initial load and for every later setStyle()
    // call the dark/light MutationObserver below triggers) same as the
    // other two events above -- one markStyleReady function covers all
    // three, so the route-draw effect never has to guess which case it's
    // in or trust an event that fired a tick early.
    setStyleReady(false);
    const handleStyleLoad = () => markStyleReady();
    map.on("style.load", handleStyleLoad);

    const observer = new MutationObserver(() => {
      // Reset before setStyle, not after: setStyle tears down every
      // imperative source/layer (including the route) synchronously, so
      // styleReady must already read false the moment that happens, not
      // linger true until the next "style.load" fires. Otherwise a
      // route-state change landing in that gap would see styleReady
      // still true and call drawRoute against a map that just discarded
      // its route source, throwing instead of quietly waiting.
      setStyleReady(false);
      map.setStyle(buildStyle(isDark() ? MOCHA : LATTE));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      // Bugfix (same trail-vanishes issue): if this component unmounts
      // (leaving Discover) while a markStyleReady retry loop is still
      // waiting on isStyleLoaded(), the queued rAF would otherwise fire
      // after map.remove() below has already torn the instance down,
      // calling setStyleReady on an unmounted component. Cancelled here so
      // the next mount's own effect starts that check cleanly instead of
      // racing a leftover callback from the previous one.
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      map.off("load", handleLoad);
      map.off("dataloading", handleDataLoading);
      map.off("idle", handleLoad);
      map.off("style.load", handleStyleLoad);
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 1 follow-up: a locate tap recenters the camera but drew nothing
  // at the user's own position, unlike every mapping app's own convention
  // (a pinned dot at "you are here"). Fixed with a dedicated DOM marker,
  // the same maplibregl.Marker pattern markersRef already uses for places,
  // not a style layer, so it always renders above the map canvas and never
  // competes with the route line's z-order. Created once and moved via
  // setLngLat on every userLocation change, rather than removed/recreated,
  // since the coordinate is the only thing that ever changes about it.
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  // google-style-location-heading-indicator: refs onto the two child
  // elements that change on every GPS tick without needing to touch the
  // rest of the marker's DOM (which never changes once built) -- the
  // cone's rotation and its own show/hide, and the accuracy-circle radius.
  // Plain refs rather than re-querying the marker element each time, same
  // reasoning as userMarkerRef itself: this callback can fire once a
  // second from watchPosition, so re-running querySelector on every tick
  // is needless work for values a ref reads/writes in one step.
  const userMarkerConeRef = useRef<HTMLDivElement | null>(null);
  const userMarkerAccuracyRef = useRef<HTMLDivElement | null>(null);

  // Bugfix (map stuck / snaps back to center while dragging): the camera
  // used to recenter on every `userLocation` change, and userLocation
  // updates once a second from the shell's continuous watchPosition (see
  // public-shell.tsx) even when nobody touched the locate button. So any
  // pan or drag got yanked back to the live dot within a second, making
  // the map feel "stuck". A locate tap should recenter the camera exactly
  // once, the same way it works in every other maps app -- not keep
  // forcing the view back on every later background GPS tick.
  //
  // recenterRequestId below is that one-shot signal: it only increments
  // from MapCornerControls' own onRecenterRequested (fired once per tap,
  // after getCurrentPosition resolves), never from the background watch.
  // hasAutoCenteredRef separately covers the very first fix of a session,
  // so the map still moves off the default Pasig center automatically
  // once, without that first move counting as a second "request".
  const [recenterRequestId, setRecenterRequestId] = useState(0);
  const requestRecenter = () => setRecenterRequestId((n) => n + 1);
  const hasAutoCenteredRef = useRef(false);
  const lastRecenterRequestIdRef = useRef(0);

  // Phase 4.2: recenter once a user location resolves. MapLibre's own
  // constructor `center` option, like react-leaflet's, only applies on
  // first mount, so a later location needs an imperative call.
  //
  // Phase 5.5 / Bugfix (map snapping back during Directions): a custom
  // From, or any open Directions session (directionsPanelResult), stands
  // the camera down entirely -- same reasoning as before, just no longer
  // the main guard now that the effect isn't running on every tick to
  // begin with.
  useEffect(() => {
    const map = mapRef.current;
    if (!userLocation || !map) return;

    const isFirstFix = !hasAutoCenteredRef.current;
    const isExplicitRecenter = recenterRequestId !== lastRecenterRequestIdRef.current;
    lastRecenterRequestIdRef.current = recenterRequestId;

    if (!customFrom && !directionsPanelResult && (isFirstFix || isExplicitRecenter)) {
      map.setCenter([userLocation.longitude, userLocation.latitude]);
      map.setZoom(DEFAULT_ZOOM);
    }
    hasAutoCenteredRef.current = true;

    if (!userMarkerRef.current) {
      // google-style-location-heading-indicator: three stacked layers,
      // same convention Google Maps/Google-style apps use for "you are
      // here" -- a soft accuracy-circle halo (furthest back), a
      // direction cone that rotates to the compass heading (middle), and
      // the solid white-bordered dot on top (unchanged from the old
      // single-div marker, so the no-heading look is identical to
      // before). All three live inside one wrapper div so MapLibre still
      // anchors/positions them as the single marker element it expects;
      // only the cone and halo need refs since only those two change
      // after creation (see userMarkerConeRef/userMarkerAccuracyRef
      // above) -- the dot itself never changes, no ref needed for it.
      const wrapper = document.createElement("div");
      wrapper.className = "relative flex h-4 w-4 items-center justify-center";
      wrapper.setAttribute("aria-label", "Your location");

      // Accuracy circle: a large, low-opacity blue disc behind everything
      // else, the same "roughly this precise" halo Google Maps draws
      // around its own dot. Fixed size (not derived from
      // position.coords.accuracy in meters-per-pixel) since this map has
      // no need to be metrically precise about GPS accuracy -- it's
      // reading as the same soft ambient glow every Google-style
      // implementation uses, not a literal accuracy radius.
      const accuracy = document.createElement("div");
      accuracy.className =
        "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 h-16 w-16 pointer-events-none";
      userMarkerAccuracyRef.current = accuracy;

      // Direction cone: a CSS-only wedge (radial gradient clipped to a
      // circle sector), not an SVG/image, so recoloring it is just the
      // existing --primary token same as the dot and halo already use,
      // no separate asset. Rotated in place around the dot's own center
      // (transform-origin, not repositioned) via userMarkerConeRef.
      // Hidden by default (no heading yet on first paint) and shown only
      // once a real heading value arrives, below.
      const cone = document.createElement("div");
      cone.className =
        "absolute left-1/2 top-1/2 h-20 w-20 pointer-events-none opacity-0 transition-opacity duration-300";
      cone.style.background =
        "conic-gradient(from 0deg, hsl(var(--primary) / 0.35) 0deg, hsl(var(--primary) / 0.35) 45deg, transparent 46deg, transparent 314deg, hsl(var(--primary) / 0.35) 315deg, hsl(var(--primary) / 0.35) 360deg)";
      cone.style.borderRadius = "50%";
      cone.style.maskImage =
        "radial-gradient(circle, black 0%, black 55%, transparent 78%)";
      cone.style.webkitMaskImage =
        "radial-gradient(circle, black 0%, black 55%, transparent 78%)";
      // Centering (translate -50%/-50%) is baked into the base transform
      // string alongside the heading rotation below, rather than split
      // across a Tailwind -translate-x-1/2/-translate-y-1/2 class plus an
      // inline style -- an inline `transform` set later (to rotate)
      // would otherwise overwrite the whole property and silently drop
      // the class-based centering, decentering the cone the first time a
      // heading arrives. One inline transform, always both parts.
      cone.style.transform = "translate(-50%, -50%) rotate(0deg)";
      cone.style.transformOrigin = "center";
      userMarkerConeRef.current = cone;

      // The dot itself, unchanged from the marker's old single-element
      // look -- same classes, same size, same aria-label content moved
      // up onto the wrapper. Given a subtle pulse ring (user-location-
      // pulse, index.css) so the marker still reads as "this is you,
      // live" even at a glance with no heading cone showing, matching
      // Google's own soft breathing animation on its blue dot.
      const dot = document.createElement("div");
      dot.className =
        "relative h-4 w-4 rounded-full border-2 border-white bg-primary shadow-md user-location-pulse";

      wrapper.appendChild(accuracy);
      wrapper.appendChild(cone);
      wrapper.appendChild(dot);

      userMarkerRef.current = new maplibregl.Marker({ element: wrapper })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.longitude, userLocation.latitude]);
    }

    // google-style-location-heading-indicator: rotate/show-hide the cone
    // on every tick, whether the marker was just built above or already
    // existed. heading is null whenever the device isn't reporting one
    // (stationary, or no compass support) -- same "enhancement, not
    // required" posture the rest of this geolocation code already takes,
    // so that case just keeps the cone hidden rather than showing a
    // stale or fabricated direction.
    const cone = userMarkerConeRef.current;
    if (cone) {
      if (typeof userLocation.heading === "number" && !Number.isNaN(userLocation.heading)) {
        cone.style.opacity = "1";
        // Centering translate kept alongside the rotation -- see the
        // comment where this transform is first set, above.
        cone.style.transform = `translate(-50%, -50%) rotate(${userLocation.heading}deg)`;
      } else {
        cone.style.opacity = "0";
      }
    }
    // customFrom is a dependency so the effect also runs once when a From
    // is *cleared* (Cancel): with the guard now open, and isFirstFix long
    // since true, it takes the isExplicitRecenter path only if a locate
    // tap is also what's pending -- clearing a From on its own no longer
    // force-recenters the camera either, consistent with the same "only
    // an explicit request moves the camera" rule as the live-tick case.
    // directionsPanelResult is a dependency for the same reason on closing
    // a whole Directions session. userLocation stays a dependency so the
    // marker/cone code below it still updates on every tick; only the
    // setCenter/setZoom above is now gated on recenterRequestId instead.
  }, [userLocation, customFrom, directionsPanelResult, recenterRequestId]);

  useEffect(() => {
    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      userMarkerConeRef.current = null;
      userMarkerAccuracyRef.current = null;
    };
  }, []);

  // directions-distance-and-from-phases.md Phase 5.4: the start pin. One
  // MapPin marker, created once and moved, same icon and styling as
  // location-picker.tsx's (fill-primary stroke-card, h-10 w-10, anchor
  // bottom, 3px offset so the tip lands on the coordinate). Not draggable:
  // one tap is the whole flow (plan). Held in a ref like userMarkerRef.
  //
  // Driven by customFrom alone, so it shows for a search pick and a map
  // tap alike (both are a point on the map), is removed when the From is
  // cleared, and comes back on its own when this component remounts from a
  // Map/List toggle, since the shell holds the truth, not this file.
  const fromMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    const map = mapInstance;
    if (!map) return;
    if (!customFrom) {
      fromMarkerRef.current?.remove();
      fromMarkerRef.current = null;
      return;
    }
    const lngLat: [number, number] = [customFrom.coordinates.longitude, customFrom.coordinates.latitude];
    if (fromMarkerRef.current) {
      fromMarkerRef.current.setLngLat(lngLat);
      return;
    }
    const el = document.createElement("div");
    el.setAttribute("role", "img");
    // "Start point", not "Map pin": that label belongs to the form picker.
    el.setAttribute("aria-label", "Start point");
    // Display only, so pointer-events-none: this marker is added after the
    // place markers and would otherwise stack on top of one at the same
    // spot and swallow its tap. With it, a tap on the pin's box falls
    // through to whatever is underneath -- a place marker, or empty map
    // (which in pick mode sets From again, the right outcome). A z-index
    // would not do this job: markers are all positioned, so equal or auto
    // z-index falls back to DOM order, and the pin is later in the DOM.
    el.className = "pointer-events-none";
    el.innerHTML = renderToStaticMarkup(
      <MapPin className="block h-10 w-10 fill-primary stroke-card" aria-hidden="true" />,
    );
    fromMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, 3] })
      .setLngLat(lngLat)
      .addTo(map);
  }, [customFrom, mapInstance]);

  useEffect(() => {
    return () => {
      fromMarkerRef.current?.remove();
      fromMarkerRef.current = null;
    };
  }, []);

  // Phase 5.2: mirrors pickingOnMap for the marker click listeners below.
  // Those listeners are created inside an effect keyed on [results,
  // isMobile], so reading the prop directly would close over whatever
  // value it had when the marker was built and never see a later change.
  // A ref read at click time always sees the current value. Also holds
  // the latest onMapPick for the same reason -- the shell's handler is
  // recreated whenever its own dependencies change.
  const pickingOnMapRef = useRef(pickingOnMap);
  const onMapPickRef = useRef(onMapPick);
  useEffect(() => {
    pickingOnMapRef.current = pickingOnMap;
    onMapPickRef.current = onMapPick;
  }, [pickingOnMap, onMapPick]);

  // Phase 5.2: the map tap. Attached only while pickingOnMap is true and
  // removed the moment it turns false -- never an always-on listener,
  // which would open a card and set From on the same tap. A marker click
  // is a DOM click on the marker's own element, and maplibre also fires
  // map "click" for it (the event bubbles up to the canvas container), so
  // the check below hands marker taps to the marker listener alone and
  // never counts one twice -- location-picker.tsx's guard, inverted:
  // there it ignores taps on its own pin, here it ignores taps on any
  // place marker.
  useEffect(() => {
    const map = mapInstance;
    if (!map || !pickingOnMap) return;
    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      const target = e.originalEvent.target as Node | null;
      if (target && markersRef.current.some((m) => m.getElement().contains(target))) return;
      onMapPickRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
    };
    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [mapInstance, pickingOnMap]);

  // Phase 5.3: Escape ends pick mode and keeps the previous From. Same
  // rule as the listener above: attached only while picking, removed
  // after. The prompt's own X calls the same handler.
  useEffect(() => {
    if (!pickingOnMap) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelPickOnMap();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickingOnMap, onCancelPickOnMap]);

  // locate-me-and-directions-phases.md Phase 3.5-3.7: route line, drawn
  // imperatively on demand rather than kept in buildStyle (buildStyle
  // rebuilds the whole style on every dark/light toggle via the
  // MutationObserver above, which would otherwise wipe an in-progress
  // route -- an imperative source/layer survives a setStyle only if
  // re-added after, so this is re-added on the same "style.load" event
  // buildStyle's own dark-mode switch fires, not left to silently vanish).
  // Bugfix (route line invisible/hard to see): palette.peach is already
  // the road-major layer's color, so a peach route drawn over major roads
  // was indistinguishable from the roads themselves. palette.mauve used
  // instead -- still a token per ux-ui-guidelines.md's tokens-only rule,
  // and distinct from palette.blue's water/waterway use so a route never
  // reads as a river.
  //
  // Map-marker-icons-phase follow-up: geometry now comes from the `route`
  // prop (discover.tsx's own state), not an internal-only ref, so a fresh
  // mount of this component (switching back from list view after a
  // Directions tap there) draws whatever discover.tsx is already holding,
  // via the [route] effect below, instead of starting blank.
  const drawRoute = (geometry: RouteGeometry) => {
    const map = mapRef.current;
    if (!map) return;
    // Guards against addSource/addLayer throwing when called before the
    // style has finished loading (first paint, or mid dark/light setStyle
    // swap) -- the [route, styleReady] effect below re-runs this same draw
    // once styleReady flips true, so it's safe to skip here rather than
    // throw and get mis-reported upstream as a routing-fetch failure in
    // result-card.tsx's catch block. Belt-and-suspenders alongside the
    // styleReady check that now gates the calling effects: cheap to keep,
    // still correct if drawRoute is ever called from a new site directly.
    if (!map.isStyleLoaded()) return;
    const palette = document.documentElement.classList.contains("dark") ? MOCHA : LATTE;
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "Feature", properties: {}, geometry });
    } else {
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry },
      });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": palette.mauve, "line-width": 4 },
      });
    }
    const bounds = geometry.coordinates.reduce(
      (b, coord) => b.extend(coord as [number, number]),
      new maplibregl.LngLatBounds(geometry.coordinates[0], geometry.coordinates[0]),
    );
    map.fitBounds(bounds, { padding: 48 });
  };

  // directions-panel-phases.md Phase 2.2: the counterpart to drawRoute
  // above. Clears the line's own data back to empty rather than removing
  // the source/layer outright -- cheaper to re-populate on the next
  // drawRoute call (setData vs. addSource/addLayer again), and matches
  // drawRoute's own not-ready guards so a Cancel tap before the style has
  // finished loading is a safe no-op, not a throw.
  const clearRoute = () => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [] });
  };

  // Draws whenever there's a route to draw AND the map is actually ready
  // to accept a source/layer -- covers every case in one effect instead of
  // the two that used to exist here:
  //   - a fresh Directions tap while this component is already mounted
  //     (route changes, styleReady is already true from an earlier load)
  //   - a route that already existed before switching back from list view,
  //     or before this component's very first mount (route starts non-null,
  //     styleReady starts false and flips true once the map's initial
  //     style finishes loading -- this is the exact case that used to be
  //     silently dropped, see styleReady's own declaration comment above)
  //   - buildStyle's dark/light setStyle call tearing down every
  //     imperative layer (styleReady is reset to false right before that
  //     setStyle call fires, per the MutationObserver above, then flips
  //     back true once the new style's own "style.load" fires, re-running
  //     this effect and redrawing the route onto the new style)
  // Both dependencies matter: route alone can't tell whether the map can
  // currently accept the draw, and styleReady alone can't tell whether
  // there's anything to draw.
  useEffect(() => {
    if (!styleReady) return;
    if (route) {
      drawRoute(route);
    } else {
      clearRoute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, styleReady]);

  // directions-panel-phases.md Phase 2.2: route can now go from a value
  // back to null (discover.tsx's setRoute(null), wired to Phase 4's panel
  // Cancel button), not just from one value to a different one. The
  // [route, styleReady] effect above handles both directions -- drawRoute
  // on a value, clearRoute on null -- so dismissing the result popup still
  // leaves the line visible (Phase 3.7's original behavior, unchanged),
  // and only an explicit Cancel removes it.

  // No container-resize handling: this component always renders into the
  // shell's fixed <main> region (public-shell.tsx) at a constant height.
  // Discover's filter drag (public-shell.tsx's HeaderFilterArea, merged
  // into the header) only grows the header above this component, it never
  // resizes or repositions this container, so MapLibre never needs an
  // imperative resize() call here.

  // Markers: cleared and redrawn on every results change, same
  // filter-out-missing-coordinates rule as before.
  //
  // Phase 1.6-1.7: hover listeners are desktop-only (isMobile from
  // useIsMobile, re-read on every results/isMobile change since a marker
  // element is recreated here whenever either changes) and coexist with
  // the existing click listener unchanged -- a tap on a touch device only
  // ever fires the click handler below (mouseenter/mouseleave never fire
  // from a touch tap in the same way, and are skipped outright here when
  // isMobile is true, so there's no dead hover state to clean up on a
  // touch device). mouseleave clears `hovered` so the preview never
  // outlives the pointer leaving the marker, matching 1.8's "hidden
  // cleanly" requirement applied to this control too.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = results
      .filter((result) => result.latitude != null && result.longitude != null)
      .map((result) => {
        const marker = new maplibregl.Marker({ element: markerElement(result) })
          .setLngLat([result.longitude as number, result.latitude as number])
          .addTo(map);
        const el = marker.getElement();
        // Phase 5.2: while picking From, a marker tap is a pin drop at that
        // marker's own coordinates, carrying the place's name as the label
        // (open-questions.md Resolved #9 -- Google draws no line between a
        // tap on empty map and a tap on an existing point), and never opens
        // the ResultCard. Reads the refs, not the props: this closure is
        // built once per [results, isMobile] and would otherwise see a
        // stale pickingOnMap. Outside pick mode: unchanged.
        el.addEventListener("click", () => {
          if (pickingOnMapRef.current) {
            onMapPickRef.current(
              { latitude: result.latitude as number, longitude: result.longitude as number },
              result.name,
            );
            return;
          }
          setSelected(result);
        });
        if (!isMobile) {
          el.addEventListener("mouseenter", (e: MouseEvent) => {
            const bounds = containerRef.current?.getBoundingClientRect();
            if (!bounds) return;
            setHovered({ result, x: e.clientX - bounds.left, y: e.clientY - bounds.top });
          });
          el.addEventListener("mousemove", (e: MouseEvent) => {
            const bounds = containerRef.current?.getBoundingClientRect();
            if (!bounds) return;
            setHovered({ result, x: e.clientX - bounds.left, y: e.clientY - bounds.top });
          });
          el.addEventListener("mouseleave", () => setHovered(null));
        }
        return marker;
      });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      setHovered(null);
    };
  }, [results, isMobile]);

  // Priority-gated label visibility (see MARKER_LABEL_MIN_ZOOM_VERIFIED/
  // _PENDING above): a separate effect from the marker-build one above
  // because this needs to re-run on every zoom change, not only when
  // results/isMobile change, and rebuilding every marker element on every
  // zoom tick would be far more work than just toggling a CSS property
  // already sitting in the DOM. Reads live off markersRef (populated by
  // the effect above) rather than holding its own copy of the marker
  // list, so it always applies to whatever markers currently exist --
  // runs once immediately on mount/results-change for the initial zoom,
  // then again on every "zoom" event for live updates while the user
  // pinches/scrolls. Each label's own data-verification-status (set in
  // markerElement above) picks which threshold applies to it, so verified
  // and pending results can turn their labels on at different zooms in
  // the same pass, no second data lookup needed here.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyLabelVisibility = () => {
      const zoom = map.getZoom();
      markersRef.current.forEach((marker) => {
        const label = marker.getElement().querySelector<HTMLElement>(".marker-name-label");
        if (!label) return;
        const minZoom =
          label.dataset.verificationStatus === "pending"
            ? MARKER_LABEL_MIN_ZOOM_PENDING
            : MARKER_LABEL_MIN_ZOOM_VERIFIED;
        label.style.display = zoom >= minZoom ? "" : "none";
      });
    };

    applyLabelVisibility();
    map.on("zoom", applyLabelVisibility);
    return () => {
      map.off("zoom", applyLabelVisibility);
    };
  }, [results, isMobile]);

  // Phase 1.7: a tap/click still opens the full ResultCard via the
  // unchanged click listener above -- opening it also clears any lingering
  // hover preview, since a modal is now covering the map and a preview
  // underneath it would be pointless clutter, not a second overlapping
  // surface.
  const previewResult = useMemo(() => (selected ? null : hovered), [selected, hovered]);

  return (
    <div className="relative h-full w-full">
      {/* Phase 5.3: crosshair while picking, desktop only. A class on the
          container (md: matches ZoomControl's own desktop breakpoint), not
          a poke at maplibre's own canvas styles. maplibre sets its own
          cursor (grab/grabbing) on its canvas container and canvas from
          its own stylesheet, so the arbitrary-variant selectors reach
          down to both, and !important is what lets them win over that
          stylesheet's higher-specificity selectors.
          Place markers keep cursor-pointer from markerElement's own class,
          which is right: in pick mode a marker tap also sets From. */}
      <div
        ref={containerRef}
        className={cn(
          "h-full w-full",
          pickingOnMap && "md:[&_.maplibregl-canvas-container]:!cursor-crosshair md:[&_.maplibregl-canvas]:!cursor-crosshair",
        )}
      />

      {resultsError ? (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-[1000] flex justify-center px-6">
          <span className="max-w-full break-words rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-destructive shadow">
            {resultsError}
          </span>
        </div>
      ) : (
        <>
          {(resultsLoading || tilesLoading) && (
            <div className="pointer-events-none absolute inset-x-0 top-6 z-[1000] flex justify-center px-6">
              <span className="max-w-full break-words rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-muted-foreground shadow">
                {resultsLoading ? "Loading places and businesses…" : "Loading map…"}
              </span>
            </div>
          )}

          {isEmpty && (
            <div className="pointer-events-none absolute inset-x-0 top-6 z-[1000] flex justify-center px-6">
              <span className="max-w-full break-words rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-muted-foreground shadow">
                No results match your search and filters.
              </span>
            </div>
          )}
        </>
      )}

      {/* Combined top-right pill: legend toggle (its own LegendPanel stays
          hidden while categories are still resolving/empty, same
          isEmpty check the old MapLegend had) and locate-me, merged per
          direct instruction and reference image. Does not block on
          resultsLoading/resultsError since the legend's content (category
          directories) is independent of whether the marker query itself
          succeeded. */}
      <MapCornerControls
        placeCategories={placeCategories}
        businessCategories={businessCategories}
        categoriesLoading={categoriesLoading}
        onLocationFound={onLocationFound}
        onRecenterRequested={requestRecenter}
      />

      {/* Bottom-right +/- zoom pill, desktop only, per direct instruction
          and reference screenshot -- see ZoomControl's own comment for why
          this is a separate small component fed the live map instance via
          mapInstance state rather than reading mapRef directly. */}
      <ZoomControl map={mapInstance} />

      {/* desktop-directions-panel-phases.md Phase 2.3: desktop-only
          (mobile renders its own fixed panel from discover.tsx directly,
          !isMobile here avoids mounting both at once on a resize
          boundary), bottom-centered floating card in this container's own
          coordinate space -- see directions-panel.tsx's variant="desktop"
          branch for the positioning/sizing reasoning (same row as
          ZoomControl, content-sized rather than a full-height strip). */}
      {!isMobile && directionsPanelResult && (
        <DirectionsPanel
          variant="desktop"
          result={directionsPanelResult}
          selectedMode={selectedMode}
          onSelectMode={onSelectMode}
          durationSeconds={routeDuration}
          distanceMeters={routeDistance}
          isLoading={modeLoading}
          errorReason={modeErrorReason}
          onCancel={onCancelDirections}
          fromLabel={fromLabel}
          onSelectFrom={onSelectFrom}
          onResetFrom={onResetFrom}
          onPickOnMap={onPickOnMap}
          pickingOnMap={pickingOnMap}
          onCancelPickOnMap={onCancelPickOnMap}
        />
      )}

      {previewResult && (
        <HoverPreview result={previewResult.result} x={previewResult.x} y={previewResult.y} />
      )}

      <ResultCard
        result={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        // Phase 3.2: origin, not userLocation -- ResultCard's prop keeps its
        // old name (renaming needs approval) but now carries the route
        // origin. The blue dot and recenter effect above stay on
        // userLocation.
        userLocation={origin}
        onRouteFound={onRouteFound}
      />
    </div>
  );
}
