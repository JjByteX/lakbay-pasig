import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { LocateFixed, MapPin } from "lucide-react";
import type { Coordinates } from "@/lib/discover-query";
import type { DiscoverResult } from "@/lib/discover-types";
import { fetchActiveCategories, type PlaceCategory } from "@/lib/place-categories";
import { getCategoryIcon } from "@/lib/place-category-icons";
import { fetchActiveCategories as fetchActiveBusinessCategories, type BusinessCategory } from "@/lib/business-categories";
import { getBusinessCategoryIcon } from "@/lib/business-category-icons";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { RouteGeometry } from "@/lib/directions";
import { ResultCard, VerificationBadge } from "./result-card";

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

const PASIG_CENTER: Coordinates = { latitude: 14.5764, longitude: 121.0851 };
const DEFAULT_ZOOM = 14;
// locate-me-and-directions-phases.md Phase 3.5: one GeoJSON source/line
// layer pair, added and removed imperatively, the same shape buildStyle
// already uses for the waterway layer -- no new rendering library.
const ROUTE_SOURCE_ID = "directions-route";
const ROUTE_LAYER_ID = "directions-route-line";

// Catppuccin Latte (light) / Mocha (dark) hex values, one per OpenMapTiles
// feature type. Latte is the default; MOCHA overrides apply when `.dark` is
// present on <html>, matching this codebase's existing class-based dark
// mode strategy (tailwind.config.ts's `darkMode: ["class"]`, the same
// convention the old overlay div's `dark:` variant relied on).
//
// Fix, human-reported (screenshot): the first version used Catppuccin's own
// surface0/1/2 for buildings/roads, adjacent steps on Catppuccin's neutral
// ramp (base 241 lum -> mantle 233 -> surface0 208 -> surface1 192 ->
// surface2 176, all the same blue-grey hue). That's correct as Catppuccin,
// which designs that ramp as a low-contrast backdrop for UI chrome, but
// it's the wrong tool for a basemap: building/road polygons need to read
// as distinct color against the page and against each other, not blend
// into one grey mass, which is exactly what the screenshot showed.
// Building/road/boundary tokens below are pulled from further apart on the
// same real Catppuccin palette (surface1, overlay0, overlay1, subtext0/1)
// instead of adjacent surface steps, still Latte/Mocha's own hex values,
// chosen for contrast instead of copied mechanically by matching name.
const LATTE = {
  base: "#eff1f5",
  mantle: "#e6e9ef",
  green: "#40a02b",
  blue: "#1e66f5",
  sapphire: "#209fb5",
  building: "#bcc0cc", // surface1
  buildingLine: "#acb0be", // surface2, one soft step off the fill
  road: "#9ca0b0", // overlay0
  roadDark: "#8c8fa1", // overlay1, secondary/tertiary, one step darker than minor roads
  peach: "#fe640b",
  railway: "#6c6f85", // subtext1
  boundary: "#6c6f85", // subtext1
  text: "#4c4f69",
};

const MOCHA: typeof LATTE = {
  base: "#1e1e2e",
  mantle: "#181825",
  green: "#a6e3a1",
  blue: "#89b4fa",
  sapphire: "#74c7ec",
  building: "#45475a", // surface1
  buildingLine: "#585b70", // surface2, one soft step off the fill
  road: "#6c7086", // overlay0
  roadDark: "#7f849c", // overlay1
  peach: "#fab387",
  railway: "#a6adc8", // subtext0
  boundary: "#a6adc8", // subtext0
  text: "#cdd6f4",
};

// OpenFreeMap's `openmaptiles` vector source (OpenMapTiles schema) and font
// glyph endpoint, confirmed directly from OpenFreeMap's own hosted styles
// (tiles.openfreemap.org/styles/liberty, same source/glyphs every OFM style
// shares). No sprite here: Positron itself ships no POI icons (OpenFreeMap's
// own Positron fork removes POIs entirely, "a special clean looking style"
// per its changelog), and this screen's own markers are Leaflet-era
// divIcon-alikes drawn with MapLibre markers below, not sprite images, so
// no sprite URL is needed.
function buildStyle(palette: typeof LATTE): StyleSpecification {
  return {
    version: 8,
    sources: {
      openmaptiles: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
      },
    },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    // Every symbol layer below sets its own text-font: "Noto Sans Regular",
    // the only fontstack OpenFreeMap actually hosts. Without an explicit
    // text-font, maplibre-gl falls back to its hardcoded default stack
    // ("Open Sans Regular, Arial Unicode MS Regular"), which 404s against
    // OpenFreeMap on every glyph request (Arial isn't open-source, was
    // never hosted there) and silently degrades to slow per-codepoint
    // local rendering. Confirmed via OpenFreeMap's own font directory and
    // a maintainer thread on this exact default-stack 404 (maplibre-gl-js
    // discussion #4737).
    layers: [
      { id: "background", type: "background", paint: { "background-color": palette.base } },
      {
        id: "landuse-residential",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["==", ["get", "class"], "residential"],
        paint: { "fill-color": palette.mantle },
      },
      {
        id: "landcover-wood",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "wood"],
        paint: { "fill-color": palette.green, "fill-opacity": 0.5 },
      },
      {
        id: "park",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "fill-color": palette.green, "fill-opacity": 0.35 },
      },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": palette.blue },
      },
      {
        id: "waterway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        paint: { "line-color": palette.blue, "line-width": 1 },
      },
      {
        id: "building",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": palette.building,
          "fill-outline-color": palette.buildingLine,
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["minor", "service", "track"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": palette.road,
          "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 13, 0.5, 20, 12],
        },
      },
      {
        id: "road-secondary-tertiary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["secondary", "tertiary"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": palette.roadDark,
          "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 8, 1, 20, 14],
        },
      },
      {
        id: "road-major",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["match", ["get", "class"], ["primary", "trunk", "motorway"], true, false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": palette.peach,
          "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 0.5, 20, 18],
        },
      },
      {
        id: "railway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": palette.railway, "line-width": 1 },
      },
      {
        id: "boundary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: [">=", ["get", "admin_level"], 3],
        paint: { "line-color": palette.boundary, "line-width": 1, "line-dasharray": [2, 1] },
      },
      {
        id: "water-name",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "water_name",
        layout: { "text-field": ["get", "name"], "text-size": 12, "text-font": ["Noto Sans Regular"] },
        paint: {
          "text-color": palette.sapphire,
          "text-halo-color": palette.base,
          "text-halo-width": 1,
        },
      },
      {
        id: "road-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
        paint: {
          "text-color": palette.text,
          "text-halo-color": palette.base,
          "text-halo-width": 1,
        },
      },
      {
        id: "place-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["match", ["get", "class"], ["city", "town", "village"], true, false],
        layout: { "text-field": ["get", "name"], "text-size": 13, "text-font": ["Noto Sans Regular"] },
        paint: {
          "text-color": palette.text,
          "text-halo-color": palette.base,
          "text-halo-width": 1.5,
        },
      },
    ],
  };
}

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
function markerElement(result: DiscoverResult): HTMLElement {
  const Icon =
    result.kind === "place"
      ? getCategoryIcon(result.categoryIcon ?? "")
      : getBusinessCategoryIcon(result.categoryIcon ?? "");
  const el = document.createElement("span");
  el.className =
    result.verification_status === "pending"
      ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground bg-card shadow cursor-pointer"
      : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-card shadow cursor-pointer";
  el.innerHTML = renderToStaticMarkup(<Icon className="h-4 w-4 text-foreground" aria-hidden="true" />);
  return el;
}

interface DiscoverMapProps {
  results: DiscoverResult[];
  userLocation: Coordinates | null;
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
  onRouteFound: (geometry: RouteGeometry) => void;
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
// top-14 rather than top-3: this container also renders the status/
// loading/error pills (resultsError/resultsLoading/tilesLoading/isEmpty,
// below), horizontally centered at top-3 with max-w-full text that can run
// wide enough to reach this corner on narrower viewports -- top-14 clears
// that row entirely so the corner pill and a centered status message never
// visually collide.
function MapCornerControls({
  placeCategories,
  businessCategories,
  categoriesLoading,
  onLocationFound,
}: Readonly<{
  placeCategories: PlaceCategory[];
  businessCategories: BusinessCategory[];
  categoriesLoading: boolean;
  onLocationFound?: (coords: Coordinates) => void;
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
        });
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

// Phase 1.5-1.7: hover preview, desktop only (1.6's "hover has no mobile
// equivalent"), reusing result-card.tsx's own summary fields (name,
// category, verification label, one-line description) rather than a new
// layout, per 1.6's explicit instruction. Positioned near the cursor
// (1.6), dismissed on mouse leave -- a click/tap still opens the existing
// ResultCard modal via the marker's own click handler, unchanged, per
// 1.7's "hover never replaces the existing tap flow."
function HoverPreview({
  result,
  x,
  y,
}: Readonly<{ result: DiscoverResult; x: number; y: number }>) {
  return (
    <div
      className="pointer-events-none absolute z-[1000] w-64 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
      style={{ left: x + 12, top: y + 12 }}
    >
      <p className="text-sm font-semibold text-foreground">{result.name}</p>
      <p className="text-xs text-muted-foreground">{result.category}</p>
      {result.description && (
        <p className="mt-1 text-xs text-foreground">{result.description}</p>
      )}
      <div className="mt-2">
        <VerificationBadge status={result.verification_status} />
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
 * feature type (see buildStyle above), not a CSS blend. Prop contract
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
  resultsLoading,
  resultsError,
  onLocationFound,
  route,
  onRouteFound,
}: Readonly<DiscoverMapProps>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selected, setSelected] = useState<DiscoverResult | null>(null);
  const [tilesLoading, setTilesLoading] = useState(true);
  const isEmpty = !resultsError && !resultsLoading && !tilesLoading && results.length === 0;

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
        customAttribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles by <a href="https://openfreemap.org">OpenFreeMap</a>, routing by <a href="https://project-osrm.org">OSRM</a>',
      },
    });
    mapRef.current = map;

    // Phase 8.1 parity: tiles are their own loading concern, separate from
    // the results query. MapLibre's "load" fires once the initial style +
    // visible tiles are ready; "dataloading"/"idle" cover later pan/zoom
    // tile fetches, mirroring the old TileLoadIndicator's
    // loading/load/whenReady trio (no whenReady equivalent needed here:
    // unlike Leaflet, attaching "load" after MapLibre's own constructor-
    // driven initial load is not a race, the listener is attached
    // synchronously in this same effect, before the browser yields).
    const handleLoad = () => setTilesLoading(false);
    const handleDataLoading = () => setTilesLoading(true);
    map.on("load", handleLoad);
    map.on("dataloading", handleDataLoading);
    map.on("idle", handleLoad);

    const observer = new MutationObserver(() => {
      map.setStyle(buildStyle(isDark() ? MOCHA : LATTE));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      map.off("load", handleLoad);
      map.off("dataloading", handleDataLoading);
      map.off("idle", handleLoad);
      map.remove();
      mapRef.current = null;
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

  // Phase 4.2: recenter once a user location resolves. MapLibre's own
  // constructor `center` option, like react-leaflet's, only applies on
  // first mount, so a later location needs an imperative call.
  useEffect(() => {
    const map = mapRef.current;
    if (!userLocation || !map) return;
    map.setCenter([userLocation.longitude, userLocation.latitude]);
    map.setZoom(DEFAULT_ZOOM);

    if (!userMarkerRef.current) {
      const dot = document.createElement("div");
      dot.className = "h-4 w-4 rounded-full border-2 border-white bg-primary shadow-md";
      dot.setAttribute("aria-label", "Your location");
      userMarkerRef.current = new maplibregl.Marker({ element: dot })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userLocation.longitude, userLocation.latitude]);
    }
  }, [userLocation]);

  useEffect(() => {
    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    };
  }, []);

  // locate-me-and-directions-phases.md Phase 3.5-3.7: route line, drawn
  // imperatively on demand rather than kept in buildStyle (buildStyle
  // rebuilds the whole style on every dark/light toggle via the
  // MutationObserver above, which would otherwise wipe an in-progress
  // route -- an imperative source/layer survives a setStyle only if
  // re-added after, so this is re-added on the same "style.load" event
  // buildStyle's own dark-mode switch fires, not left to silently vanish).
  // palette.peach reused from the existing road-major layer, not a new
  // color, per ux-ui-guidelines.md's tokens-only rule -- distinct from
  // palette.blue's water/waterway use so a route never reads as a river.
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
    // swap) -- style.load re-runs this same draw once ready, so it's safe
    // to skip here rather than throw and get mis-reported upstream as a
    // routing-fetch failure in result-card.tsx's catch block.
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
        paint: { "line-color": palette.peach, "line-width": 4 },
      });
    }
    const bounds = geometry.coordinates.reduce(
      (b, coord) => b.extend(coord as [number, number]),
      new maplibregl.LngLatBounds(geometry.coordinates[0], geometry.coordinates[0]),
    );
    map.fitBounds(bounds, { padding: 48 });
  };

  // Draws on mount and whenever discover.tsx's route state changes --
  // covers both a fresh Directions tap on this component's own ResultCard
  // and a route that already existed before switching back from list view.
  useEffect(() => {
    if (route) drawRoute(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Phase 3.7: a drawn route is not cleared just because the popup closes
  // -- the popup closes specifically so the line stays visible (Part 2's
  // own "close the popup so the line is visible"), so dismissal is not
  // "without a fitting replacement," it's the intended end state. A repeat
  // tap on Directions, or a different result's Directions, replaces the
  // existing route via drawRoute's own setData call above, which is the
  // "before drawing a new one" half of 3.7 -- no separate clear path is
  // wired to any control in this phase, so no clearRoute function is kept
  // around unused (would fail this project's noUnusedLocals build setting
  // anyway). Add one if a future phase adds an explicit "clear route"
  // affordance.

  // Re-adds the route after buildStyle's dark/light setStyle call above
  // tears down every imperative layer, so a route drawn before a theme
  // toggle doesn't silently disappear. Reads the same `route` prop rather
  // than a separate ref, so this and the mount effect above never disagree
  // about which geometry is current.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleStyleLoad = () => {
      if (route) drawRoute(route);
    };
    map.on("style.load", handleStyleLoad);
    return () => {
      map.off("style.load", handleStyleLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

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
        el.addEventListener("click", () => setSelected(result));
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

  // Phase 1.7: a tap/click still opens the full ResultCard via the
  // unchanged click listener above -- opening it also clears any lingering
  // hover preview, since a modal is now covering the map and a preview
  // underneath it would be pointless clutter, not a second overlapping
  // surface.
  const previewResult = useMemo(() => (selected ? null : hovered), [selected, hovered]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {resultsError ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-6">
          <span className="max-w-full break-words rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-destructive shadow">
            {resultsError}
          </span>
        </div>
      ) : (
        <>
          {(resultsLoading || tilesLoading) && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-6">
              <span className="max-w-full break-words rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-muted-foreground shadow">
                {resultsLoading ? "Loading places and businesses…" : "Loading map…"}
              </span>
            </div>
          )}

          {isEmpty && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-6">
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
      />

      {previewResult && (
        <HoverPreview result={previewResult.result} x={previewResult.x} y={previewResult.y} />
      )}

      <ResultCard
        result={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        userLocation={userLocation}
        onRouteFound={onRouteFound}
      />
    </div>
  );
}
