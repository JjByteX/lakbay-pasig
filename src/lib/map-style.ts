import type { StyleSpecification } from "maplibre-gl";
import type { Coordinates } from "@/lib/discover-query";

// Moved out of discover-map.tsx, location-field-phases.md Phase 1. Shared by
// Discover and the location picker so every map in the app has one look.
// The style code is a pure move, no value or logic edits. The bounds block
// at the bottom is newer (map-bounds-plan.md): where Discover's map may pan.

export const PASIG_CENTER: Coordinates = { latitude: 14.5764, longitude: 121.0851 };
export const DEFAULT_ZOOM = 14;

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
export const LATTE = {
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
  // Bugfix, human-reported: the directions route line used to reuse
  // `peach`, the exact same color as the road-major layer just below --
  // a walking/driving route drawn along a major road was visually
  // indistinguishable from the road itself. `mauve` is unused anywhere
  // else in this palette (green = parks, blue = water, peach = major
  // roads, road/roadDark/building = neutral greys), so the route now
  // reads as its own distinct line against every other layer in both
  // themes, not just against the one road tier it happens to sit near.
  mauve: "#8839ef",
  railway: "#6c6f85", // subtext1
  boundary: "#6c6f85", // subtext1
  text: "#4c4f69",
};

export const MOCHA: typeof LATTE = {
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
  mauve: "#cba6f7",
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
export function buildStyle(palette: typeof LATTE): StyleSpecification {
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

// West, South, East, North. The order maplibre's `maxBounds` and Photon's
// `bbox` both take, so one tuple feeds either. Tuples only, no maplibre
// import at runtime, so `npx tsx src/lib/map-style.ts` runs bare.
export type Bounds = [number, number, number, number];

// Pasig's own box. Covers all 8 seeded points. geocode.ts joins it into
// Photon's bbox string, so search and the map share one copy.
export const PASIG_BOUNDS: Bounds = [121.03, 14.52, 121.13, 14.62];

// Discover's locked box: Pasig plus 0.065 degrees (about 7 km) each side.
// `maxBounds` keeps the whole screen inside the box, not only the center,
// and phones are tall, so this is sized for them: a 390x700 phone frames a
// route up to 10.8 km wide here (7.5 km at 0.03). About 25 by 25 km.
// Literals, not sums, so no float noise creeps into the edges.
export const BASE_BOUNDS: Bounds = [120.965, 14.455, 121.195, 14.685];

// The one step growth box: Pasig plus 0.15 degrees (about 16 km), about 43
// by 44 km. Adds Alabang type origins. A point outside it never lifts the
// lock, so a visitor in Cebu can't unlock the map.
// ponytail: both boxes are rectangles, so parts of neighboring cities stay
// reachable. Add a polygon check only if the city border starts to matter.
export const GROW_LIMIT: Bounds = [120.88, 14.37, 121.28, 14.77];

export function inBounds(box: Bounds, point: Coordinates): boolean {
  const [west, south, east, north] = box;
  return point.longitude >= west && point.longitude <= east && point.latitude >= south && point.latitude <= north;
}

// The lowest zoom where a width x height pixel screen still fits inside the
// box: the larger of log2(screen width / box width) and log2(screen height /
// box height), both in pixels at zoom 0 (Mercator, 512 px tiles). This is
// what `maxBounds` enforces as a floor. It is not cameraForBounds, which
// returns the zoom where the WHOLE box is visible, about 0.8 lower on a phone.
export function floorZoom(box: Bounds, width: number, height: number): number {
  const [west, south, east, north] = box;
  const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const boxWidth = ((east - west) / 360) * 512;
  const boxHeight = ((mercatorY(north) - mercatorY(south)) / (2 * Math.PI)) * 512;
  return Math.max(Math.log2(width / boxWidth), Math.log2(height / boxHeight));
}

// Ponytail's non-trivial-logic rule: floorZoom and inBounds get the smallest
// runnable check, plain asserts, no framework. Same pattern as geocode.ts.
// Run with: npx tsx src/lib/map-style.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  assertEqual(round2(floorZoom(BASE_BOUNDS, 390, 700)), 11.02, "base box, 390x700 phone");
  assertEqual(round2(floorZoom(BASE_BOUNDS, 1400, 800)), 12.06, "base box, 1400x800 laptop");
  assertEqual(round2(floorZoom(GROW_LIMIT, 390, 700)), 10.22, "limit box, 390x700 phone");

  const makati = { latitude: 14.5547, longitude: 121.0244 };
  const alabang = { latitude: 14.42, longitude: 121.04 };
  const cebu = { latitude: 10.3157, longitude: 123.8854 };
  assertEqual(inBounds(BASE_BOUNDS, PASIG_CENTER), true, "Pasig center is in the base box");
  assertEqual(inBounds(BASE_BOUNDS, makati), true, "Makati is in the base box");
  assertEqual(inBounds(BASE_BOUNDS, alabang), false, "Alabang is out of the base box");
  assertEqual(inBounds(GROW_LIMIT, alabang), true, "Alabang is in the limit");
  assertEqual(inBounds(GROW_LIMIT, cebu), false, "Cebu is out of the limit");

  console.log("map-style.ts demo: all checks passed");
}

// Same Node-only guard as geocode.ts: `process` doesn't exist in the Vite
// browser bundle, and this must never fire on import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
