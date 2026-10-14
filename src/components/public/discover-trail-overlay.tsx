import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { LATTE, MOCHA } from "@/lib/map-style";
import { cn } from "@/lib/utils";
import type { TrailStopState } from "./trail-stop";

/** One stop as the map draws it. Only stops with a coordinate get here. */
export interface TrailMapStop {
  id: string;
  index: number; // position in the whole trail, so numbers match the stop list
  name: string;
  latitude: number;
  longitude: number;
  state: TrailStopState;
}

const SOURCE_ID = "trail-line";
const DONE_LAYER_ID = "trail-line-done";
const NEXT_LAYER_ID = "trail-line-next";

function isDark() {
  return document.documentElement.classList.contains("dark");
}

// Numbered tile, same shape as trail-stop.tsx's number tile (rounded-md,
// primary when open, muted when locked), so a stop reads the same on the map
// and in the list. The selected stop gets a ring.
function stopElement(stop: TrailMapStop, selected: boolean, onSelect: () => void): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", `Stop ${stop.index + 1}: ${stop.name}${stop.state === "locked" ? " (locked)" : ""}`);
  el.className = cn(
    "flex h-8 w-8 items-center justify-center rounded-md border-2 border-card text-sm font-semibold shadow",
    stop.state === "locked" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
    selected && "ring-2 ring-foreground",
  );
  el.textContent = String(stop.index + 1);
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect();
  });
  return el;
}

function lineData(stops: TrailMapStop[]) {
  // A segment is done once the stop it ends on is open, so the line you have
  // already walked is solid and what is left is dashed.
  const features = stops.slice(1).map((stop, i) => ({
    type: "Feature" as const,
    properties: { done: stop.state !== "locked" },
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [stops[i].longitude, stops[i].latitude],
        [stop.longitude, stop.latitude],
      ],
    },
  }));
  return { type: "FeatureCollection" as const, features };
}

interface TrailOverlayProps {
  map: maplibregl.Map | null;
  styleReady: boolean;
  stops: TrailMapStop[];
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  // Fits the camera to these points. Owned by DiscoverMap because it also
  // grows the map's bounds first (map-bounds-plan.md), or the fit would clamp.
  onFit: (points: { latitude: number; longitude: number }[]) => void;
}

/**
 * Draws one trail on the Discover map: numbered stop markers and a line
 * between them. Renders nothing itself, it only manages map objects, the same
 * imperative source/layer pattern DiscoverMap uses for the directions route.
 * No stops means it draws nothing and clears whatever it drew.
 */
export function TrailOverlay({ map, styleReady, stops, selectedStopId, onSelectStop, onFit }: Readonly<TrailOverlayProps>) {
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  // The line. Re-runs when styleReady flips (a dark/light swap discards every
  // imperative layer) or when a stop opens and its segment turns solid.
  useEffect(() => {
    if (!map || !styleReady) return;
    const data = lineData(stops);
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      return;
    }
    if (stops.length < 2) return;
    const palette = isDark() ? MOCHA : LATTE;
    map.addSource(SOURCE_ID, { type: "geojson", data });
    map.addLayer({
      id: NEXT_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "done"], false],
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": palette.roadDark, "line-width": 3, "line-dasharray": [2, 2] },
    });
    map.addLayer({
      id: DONE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      filter: ["==", ["get", "done"], true],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": palette.mauve, "line-width": 4 },
    });
  }, [map, styleReady, stops]);

  // Remove the line when the overlay goes away (trail mode exited).
  useEffect(() => {
    return () => {
      if (!map || !map.getStyle()) return;
      if (map.getLayer(DONE_LAYER_ID)) map.removeLayer(DONE_LAYER_ID);
      if (map.getLayer(NEXT_LAYER_ID)) map.removeLayer(NEXT_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  // Markers.
  useEffect(() => {
    if (!map) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = stops.map((stop) =>
      new maplibregl.Marker({ element: stopElement(stop, stop.id === selectedStopId, () => onSelectRef.current(stop.id)) })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map),
    );
    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [map, stops, selectedStopId]);

  // Frame the whole trail once per trail, not on every state change, or the
  // camera would yank back each time a stop opens or one is tapped.
  const fittedKey = useRef<string | null>(null);
  const key = stops.map((s) => s.id).join(",");
  useEffect(() => {
    if (!map || !styleReady || stops.length === 0) {
      if (stops.length === 0) fittedKey.current = null;
      return;
    }
    if (fittedKey.current === key) return;
    fittedKey.current = key;
    onFitRef.current(stops);
  }, [map, styleReady, stops, key]);

  return null;
}
