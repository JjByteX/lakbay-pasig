import type { StyleSpecification } from "maplibre-gl";
import type { Coordinates } from "@/lib/discover-query";

// Moved out of discover-map.tsx, location-field-phases.md Phase 1. Shared by
// Discover and the location picker so every map in the app has one look.
// Pure move, no value or logic edits.

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
