import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { Coordinates } from "@/lib/discover-query";
import type { DiscoverResult } from "@/lib/discover-types";
import { ResultCard } from "./result-card";

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
} as const;

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
        layout: { "text-field": ["get", "name"], "text-size": 12 },
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
        layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-size": 11 },
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
        layout: { "text-field": ["get", "name"], "text-size": 13 },
        paint: {
          "text-color": palette.text,
          "text-halo-color": palette.base,
          "text-halo-width": 1.5,
        },
      },
    ],
  };
}

// Phase 4.3's two marker treatments (verified vs pending), same tokens as
// before (bg-primary / bg-muted-foreground) now drawn as a MapLibre Marker
// element instead of a Leaflet L.divIcon, since MapLibre has no divIcon
// concept, it takes a plain DOM node.
function markerElement(result: DiscoverResult): HTMLElement {
  const el = document.createElement("span");
  el.className =
    result.verification_status === "pending"
      ? "block h-4 w-4 rounded-full border-2 border-card bg-muted-foreground shadow cursor-pointer"
      : "block h-4 w-4 rounded-full border-2 border-card bg-primary shadow cursor-pointer";
  return el;
}

interface DiscoverMapProps {
  results: DiscoverResult[];
  userLocation: Coordinates | null;
  resultsLoading: boolean;
  resultsError: string | null;
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
 */
export function DiscoverMap({ results, userLocation, resultsLoading, resultsError }: DiscoverMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selected, setSelected] = useState<DiscoverResult | null>(null);
  const [tilesLoading, setTilesLoading] = useState(true);
  const isEmpty = !resultsError && !resultsLoading && !tilesLoading && results.length === 0;

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
        customAttribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles by <a href="https://openfreemap.org">OpenFreeMap</a>',
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

  // Phase 4.2: recenter once a user location resolves. MapLibre's own
  // constructor `center` option, like react-leaflet's, only applies on
  // first mount, so a later location needs an imperative call.
  useEffect(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.setCenter([userLocation.longitude, userLocation.latitude]);
      mapRef.current.setZoom(DEFAULT_ZOOM);
    }
  }, [userLocation]);

  // Markers: cleared and redrawn on every results change, same
  // filter-out-missing-coordinates rule as before.
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
        marker.getElement().addEventListener("click", () => setSelected(result));
        return marker;
      });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [results]);

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

      <ResultCard result={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
