import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import maplibregl from "maplibre-gl";
import { GpsFix, MapPin, Plus, Minus } from "@phosphor-icons/react";
import type { Coordinates } from "@/lib/discover-query";
import {
  LATTE,
  MOCHA,
  buildStyle,
  PASIG_CENTER,
  DEFAULT_ZOOM,
  BASE_BOUNDS,
  GROW_LIMIT,
  inBounds,
  floorZoom,
} from "@/lib/map-style";
import type { DiscoverResult } from "@/lib/discover-types";
import { fetchActiveCategories, type PlaceCategory } from "@/lib/place-categories";
import { getCategoryIcon } from "@/lib/place-category-icons";
import { fetchActiveCategories as fetchActiveBusinessCategories, type BusinessCategory } from "@/lib/business-categories";
import { getBusinessCategoryIcon } from "@/lib/business-category-icons";
import { categoryColor } from "@/lib/category-colors";
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

// Marker decluttering (markerElement below): priority-based collision
// detection, the same idea Google Maps (collisionBehavior + zIndex) and
// Apple Maps (displayPriority + collisionMode) use, plus the tiered pins
// Airbnb describes (full pin vs. smaller mini-pin). Pins are placed in
// priority order (verified before pending, then result order), and each
// gets the first tier that fits without overlapping anything already
// placed:
//   full   the 28px icon circle
//   dot    a small category-colored dot, no glyph, no label
//   hidden nothing (zoomed in past HIDE_DISABLED_ZOOM this becomes a dot
//          instead, so pins are never unreachable up close)
// Name labels are then placed for the pins that kept their full circle.
// Label placements are tried in order: beside the icon on one line (right,
// then left), beside it wrapped onto two lines, then below and above the
// icon the same way. A label that fits nowhere is hidden while its icon
// stays.
// Markers are still plain DOM elements, so this is one pass over the
// projected screen positions (layoutMarkers below), re-run on
// pan/zoom/resize, not a MapLibre symbol layer.
const MARKER_SIZE = 28; // the circle's h-7 w-7, in px
// These two gaps must match the margins in index.css's
// `.marker-name-label[data-side=...]` rules.
// Collision box half-sizes. The full icon's box is a little smaller than
// its 28px circle (a circle doesn't fill its bounding box's corners), and
// this inset is also what lets a label sit 2px above/below its own icon
// without colliding with it. DOT_COLLISION_HALF is sized for the 0.43
// scale (a 12px dot) in index.css's `.marker-pin[data-tier="dot"]
// .marker-ring` rule.
const ICON_COLLISION_HALF = 11;
const DOT_COLLISION_HALF = 7;
// At or above this zoom nothing is hidden, so two businesses with
// identical coordinates (e.g. units in the same mall) stay tappable.
const HIDE_DISABLED_ZOOM = 17;
type MarkerTier = "full" | "dot" | "hidden";
const LABEL_GAP_SIDE = 4;
const LABEL_GAP_VERTICAL = 2;
// Breathing room around a label's collision box, so the text halo
// (text-shadow reaches ~4px) never touches a neighbor.
const LABEL_COLLISION_PADDING = 3;
// Markers this far outside the viewport are skipped, so offscreen pins
// neither cost time nor block labels that are actually visible.
const LABEL_VIEWPORT_PADDING = 320;
const COLLISION_CELL_SIZE = 128;
type LabelSide = "right" | "left" | "bottom" | "top";
type LabelLines = 1 | 2;
interface LabelPlacement {
  side: LabelSide;
  lines: LabelLines;
}
// Tried in this order. One line beside the icon keeps the design as-is;
// two lines beside it is next, then above/below.
const LABEL_PLACEMENTS: readonly LabelPlacement[] = [
  { side: "right", lines: 1 },
  { side: "left", lines: 1 },
  { side: "right", lines: 2 },
  { side: "left", lines: 2 },
  { side: "bottom", lines: 1 },
  { side: "top", lines: 1 },
  { side: "bottom", lines: 2 },
  { side: "top", lines: 2 },
];

// Splits a name at the word boundary that makes the two lines closest in
// length. Returns null for a single word, which cannot wrap.
function splitLabelName(name: string): [string, string] | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return null;
  let bestIndex = 1;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(
      words.slice(0, i).join(" ").length - words.slice(i).join(" ").length,
    );
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
}

// Natural size of a label on one line, and (when the name has more than
// one word) on two lines. Measured once per label and cached, because it
// only changes with the font.
interface LabelDims {
  width1: number;
  height1: number;
  width2: number | null;
  height2: number | null;
}

function measureLabel(label: HTMLElement, cache: Map<HTMLElement, LabelDims>): LabelDims {
  const cached = cache.get(label);
  if (cached) return cached;
  // Measure in one-line mode, then put the label back how it was.
  const previousLines = label.dataset.lines;
  if (previousLines === "2") label.dataset.lines = "1";
  const width1 = label.offsetWidth;
  const height1 = label.offsetHeight;
  const lines = label.querySelectorAll<HTMLElement>(".marker-name-line");
  const twoLines = lines.length === 2;
  const dims: LabelDims = {
    width1,
    height1,
    width2: twoLines ? Math.max(lines[0].offsetWidth, lines[1].offsetWidth) : null,
    height2: twoLines ? height1 * 2 : null,
  };
  if (previousLines === "2") label.dataset.lines = "2";
  // A zero width means the label was not laid out yet; measure again later.
  if (width1 > 0) cache.set(label, dims);
  return dims;
}

interface CollisionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function rectsOverlap(a: CollisionRect, b: CollisionRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// A small uniform grid so each label is only compared against rects in
// nearby cells instead of every placed rect (keeps the per-frame pass
// cheap as the pin count grows).
class CollisionGrid {
  private readonly cells = new Map<number, CollisionRect[]>();

  private static key(cx: number, cy: number): number {
    return (cx + 4096) * 8192 + (cy + 4096);
  }

  private static range(rect: CollisionRect) {
    return {
      x0: Math.floor(rect.left / COLLISION_CELL_SIZE),
      x1: Math.floor(rect.right / COLLISION_CELL_SIZE),
      y0: Math.floor(rect.top / COLLISION_CELL_SIZE),
      y1: Math.floor(rect.bottom / COLLISION_CELL_SIZE),
    };
  }

  insert(rect: CollisionRect) {
    const { x0, x1, y0, y1 } = CollisionGrid.range(rect);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = CollisionGrid.key(cx, cy);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(rect);
        else this.cells.set(key, [rect]);
      }
    }
  }

  intersects(rect: CollisionRect): boolean {
    const { x0, x1, y0, y1 } = CollisionGrid.range(rect);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get(CollisionGrid.key(cx, cy));
        if (bucket?.some((other) => rectsOverlap(rect, other))) return true;
      }
    }
    return false;
  }
}

function labelRectFor(
  side: LabelSide,
  x: number,
  y: number,
  width: number,
  height: number,
): CollisionRect {
  const half = MARKER_SIZE / 2;
  let left: number;
  let top: number;
  if (side === "right") {
    left = x + half + LABEL_GAP_SIDE;
    top = y - height / 2;
  } else if (side === "left") {
    left = x - half - LABEL_GAP_SIDE - width;
    top = y - height / 2;
  } else if (side === "bottom") {
    left = x - width / 2;
    top = y + half + LABEL_GAP_VERTICAL;
  } else {
    left = x - width / 2;
    top = y - half - LABEL_GAP_VERTICAL - height;
  }
  return {
    left: left - LABEL_COLLISION_PADDING,
    top: top - LABEL_COLLISION_PADDING,
    right: left + width + LABEL_COLLISION_PADDING,
    bottom: top + height + LABEL_COLLISION_PADDING,
  };
}

function squareAround(x: number, y: number, half: number): CollisionRect {
  return { left: x - half, top: y - half, right: x + half, bottom: y + half };
}

// One declutter pass: reads every measurement first, decides each pin's
// tier and each label's placement, then writes data attributes (CSS in
// index.css does the fades, the dot scaling and the label positioning),
// so the browser never re-lays-out mid-loop.
function layoutMarkers(
  map: maplibregl.Map,
  markers: maplibregl.Marker[],
  cache: Map<HTMLElement, LabelDims>,
) {
  const container = map.getContainer();
  const minX = -LABEL_VIEWPORT_PADDING;
  const minY = -LABEL_VIEWPORT_PADDING;
  const maxX = container.clientWidth + LABEL_VIEWPORT_PADDING;
  const maxY = container.clientHeight + LABEL_VIEWPORT_PADDING;
  const allowHiding = map.getZoom() < HIDE_DISABLED_ZOOM;

  interface Item {
    element: HTMLElement;
    label: HTMLElement;
    x: number;
    y: number;
    dims: LabelDims;
    priority: number;
    index: number;
  }
  const visible: Item[] = [];
  const offscreen: HTMLElement[] = [];

  // Read phase.
  markers.forEach((marker, index) => {
    const element = marker.getElement();
    const label = element.querySelector<HTMLElement>(".marker-name-label");
    if (!label) return;
    const point = map.project(marker.getLngLat());
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
      offscreen.push(label);
      return;
    }
    visible.push({
      element,
      label,
      x: point.x,
      y: point.y,
      dims: measureLabel(label, cache),
      priority: Number(element.dataset.labelPriority ?? 0),
      index,
    });
  });

  // Higher priority first; ties keep result order so pins and labels
  // don't swap places while panning.
  const ordered = [...visible].sort((a, b) => b.priority - a.priority || a.index - b.index);

  // Pass 1: pin tiers. Each pin takes the first tier that fits.
  const grid = new CollisionGrid();
  const tiers = new Map<HTMLElement, MarkerTier>();
  ordered.forEach((item) => {
    const full = squareAround(item.x, item.y, ICON_COLLISION_HALF);
    if (!grid.intersects(full)) {
      grid.insert(full);
      tiers.set(item.element, "full");
      return;
    }
    const dot = squareAround(item.x, item.y, DOT_COLLISION_HALF);
    if (!allowHiding || !grid.intersects(dot)) {
      grid.insert(dot);
      tiers.set(item.element, "dot");
      return;
    }
    tiers.set(item.element, "hidden");
  });

  // Pass 2: labels, only for pins that kept their full circle. Every
  // placed pin (full or dot) is already an obstacle in the grid.
  const decisions = new Map<HTMLElement, LabelPlacement | null>();
  ordered.forEach((item) => {
    if (tiers.get(item.element) !== "full") {
      decisions.set(item.label, null);
      return;
    }
    // Try the placement the label already has first, so labels don't jump
    // between sides or line counts when a nearby label changes.
    const currentSide = item.label.dataset.side as LabelSide | undefined;
    const currentLines: LabelLines = item.label.dataset.lines === "2" ? 2 : 1;
    const placements =
      currentSide && item.label.dataset.shown === "true"
        ? [
            { side: currentSide, lines: currentLines },
            ...LABEL_PLACEMENTS.filter(
              (candidate) => !(candidate.side === currentSide && candidate.lines === currentLines),
            ),
          ]
        : LABEL_PLACEMENTS;
    for (const placement of placements) {
      const width = placement.lines === 2 ? item.dims.width2 : item.dims.width1;
      const height = placement.lines === 2 ? item.dims.height2 : item.dims.height1;
      if (width == null || height == null) continue;
      const rect = labelRectFor(placement.side, item.x, item.y, width, height);
      if (!grid.intersects(rect)) {
        grid.insert(rect);
        decisions.set(item.label, placement);
        return;
      }
    }
    decisions.set(item.label, null);
  });

  // Write phase.
  tiers.forEach((tier, element) => {
    if (element.dataset.tier !== tier) element.dataset.tier = tier;
  });
  decisions.forEach((placement, label) => {
    if (placement) {
      if (label.dataset.side !== placement.side) label.dataset.side = placement.side;
      const lines = String(placement.lines);
      if (label.dataset.lines !== lines) label.dataset.lines = lines;
      if (label.dataset.shown !== "true") label.dataset.shown = "true";
    } else if (label.dataset.shown !== "false") {
      label.dataset.shown = "false";
    }
  });
  offscreen.forEach((label) => {
    if (label.dataset.shown !== "false") label.dataset.shown = "false";
  });
}
// locate-me-and-directions-phases.md Phase 3.5: one GeoJSON source/line
// layer pair, added and removed imperatively, the same shape buildStyle
// already uses for the waterway layer -- no new rendering library.
const ROUTE_SOURCE_ID = "directions-route";
const ROUTE_LAYER_ID = "directions-route-line";

// Ring border for verification status, shared by markerElement and the
// legend's Status swatches so the two cannot drift. Verified is a solid
// card-token ring, pending a dashed muted-foreground ring. The circle's own
// fill is the category color, so status has to live on the ring.
const RING_VERIFIED = "border-2 border-card";
const RING_PENDING = "border-2 border-dashed border-muted-foreground";

// Marker: a filled circle in the category's color (Category Colors, like
// Apple Maps), the category icon as a glyph in --category-foreground, the
// ring showing verification status, and the name label in the category
// color with the existing halo from index.css. A Phosphor icon is a React
// component and maplibregl.Marker takes a raw DOM element, so the icon goes
// through renderToStaticMarkup (client-side safe), which needs
// weight="bold" passed itself (decision #25). Returns one wrapper span
// (circle + label) so the whole row is one click and hover target.
function markerElement(result: DiscoverResult): HTMLElement {
  const Icon =
    result.kind === "place"
      ? getCategoryIcon(result.categoryIcon ?? "")
      : getBusinessCategoryIcon(result.categoryIcon ?? "");
  const color = categoryColor(result.categoryColor);
  const wrapper = document.createElement("span");
  // The wrapper is exactly the circle's size, so MapLibre's default center
  // anchor puts the circle's center on the coordinate no matter whether
  // the name label is showing. The label is absolutely positioned around
  // it (side chosen by layoutMarkers, styled in index.css), which
  // keeps the pin from shifting when labels appear and disappear.
  // No `relative` here on purpose: maplibregl.Marker already gives this
  // element `position: absolute`, which is itself the positioning context
  // for the label, and a `relative` utility would override it.
  wrapper.className = "marker-pin h-7 w-7 cursor-pointer";
  // Starts as the full circle; layoutMarkers may shrink it to a dot or
  // hide it when neighbors with higher priority need the space.
  wrapper.dataset.tier = "full";
  // Higher shows first when labels compete for space: verified pins
  // (the ones a user is meant to trust and visit) outrank pending ones.
  wrapper.dataset.labelPriority = result.verification_status === "pending" ? "0" : "1";

  const ring = document.createElement("span");
  ring.className = `marker-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow ${
    result.verification_status === "pending" ? RING_PENDING : RING_VERIFIED
  }`;
  ring.style.backgroundColor = color;
  // The glyph inherits this through currentColor.
  ring.style.color = "hsl(var(--category-foreground))";
  ring.innerHTML = renderToStaticMarkup(<Icon weight="bold" className="h-3.5 w-3.5" aria-hidden="true" />);
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
  label.className = "marker-name-label whitespace-nowrap text-xs font-bold";
  label.style.color = color;
  // Hidden until layoutMarkers finds room for it.
  label.dataset.shown = "false";
  label.dataset.side = "right";
  label.dataset.lines = "1";
  // Multi-word names are stored as two line spans (joined by a space, so
  // they read as one line normally). layoutMarkers switches the label
  // to data-lines="2" to stack them when one line would overlap a neighbor.
  const split = splitLabelName(result.name);
  if (split) {
    const first = document.createElement("span");
    first.className = "marker-name-line";
    first.textContent = split[0];
    const second = document.createElement("span");
    second.className = "marker-name-line marker-name-line-2";
    second.textContent = split[1];
    label.append(first, " ", second);
  } else {
    label.textContent = result.name;
  }
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
// category icon in a filled circle, with a solid card ring for verified and
// a dashed muted-foreground ring for pending (Category Colors). The Status
// swatches below use the same two ring constants on a filled circle, so 1.4's own rule still holds: no
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
            <span
              className={`block h-4 w-4 shrink-0 rounded-full shadow ${RING_VERIFIED}`}
              style={{ backgroundColor: categoryColor(null) }}
            />
            <span className="text-sm text-foreground">Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`block h-4 w-4 shrink-0 rounded-full shadow ${RING_PENDING}`}
              style={{ backgroundColor: categoryColor(null) }}
            />
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
                  <Icon className="h-4 w-4 shrink-0" style={{ color: categoryColor(c.color) }} />
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
                  <Icon className="h-4 w-4 shrink-0" style={{ color: categoryColor(c.color) }} />
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
        const fix = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        onLocationFound({
          ...fix,
          // google-style-location-heading-indicator: same field the
          // shell's own watchPosition now populates (public-shell.tsx),
          // so a locate-me tap doesn't regress the marker back to "no
          // heading" if the device happens to report one on this read.
          heading: position.coords.heading,
        });
        // map-bounds-plan.md: outside GROW_LIMIT the camera would clamp to
        // the nearest box edge, so it doesn't move, and a silent no-op
        // would look broken. onLocationFound above still ran, so the dot
        // and the distance sort keep the real position.
        if (!inBounds(GROW_LIMIT, fix)) {
          setLocateStatus("error");
          setLocateError("You're outside the map area.");
          return;
        }
        setLocateStatus("idle");
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
          <GpsFix
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
function ZoomControl({ map, grown }: Readonly<{ map: maplibregl.Map | null; grown: boolean }>) {
  const [zoom, setZoom] = useState<number | null>(null);
  // map-bounds-plan.md: there is no minZoom on this map. maxBounds sets the
  // floor on every screen (floorZoom in map-style.ts), so Zoom out disables
  // against that instead of maplibre's own 0 default, which never binds now.
  const [floor, setFloor] = useState(0);

  // Mirrors MapCornerControls' own MutationObserver-free, event-driven
  // pattern: reads the map's live zoom on "zoom" so the buttons can
  // disable at the zoom floor / MapLibre's own max (default 22) instead of
  // silently no-opping past either end, same "visibly disabled, not
  // silently unresponsive" rule MapCornerControls' own legend toggle
  // already follows for its own loading state. The floor depends on the
  // container size and the current box, so it is recomputed on "resize" and
  // when `grown` changes (growth moves the floor without a zoom event).
  useEffect(() => {
    if (!map) return;
    const update = () => {
      setZoom(map.getZoom());
      const box = map.getMaxBounds();
      const container = map.getContainer();
      setFloor(
        box
          ? floorZoom(
              [box.getWest(), box.getSouth(), box.getEast(), box.getNorth()],
              container.clientWidth,
              container.clientHeight,
            )
          : 0,
      );
    };
    update();
    map.on("zoom", update);
    map.on("resize", update);
    return () => {
      map.off("zoom", update);
      map.off("resize", update);
    };
  }, [map, grown]);

  const maxZoom = map?.getMaxZoom() ?? 22;
  const atMax = zoom != null && zoom >= maxZoom;
  // 0.01 of slack so float rounding at the floor still disables the button.
  const atMin = zoom != null && zoom <= floor + 0.01;

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

  // map-bounds-plan.md: one step growth. The box starts at BASE_BOUNDS. When
  // the live location or a route corner is outside it but inside GROW_LIMIT,
  // the box jumps once to GROW_LIMIT. Never shrinks: growth is one way for
  // this mount, so the camera can't snap back. A point outside GROW_LIMIT is
  // ignored, so a visitor far away can't lift the lock. A fresh mount starts
  // at base and re-derives this from userLocation and route, which the shell
  // holds, so nothing is stored. Callers run it BEFORE moving the camera, or
  // the move clamps to the old box. `grown` is state (not a ref) because
  // ZoomControl reads it: growth moves its zoom floor without a zoom event.
  const [grown, setGrown] = useState(false);
  const growIfNeeded = (points: Coordinates[]) => {
    const map = mapRef.current;
    if (!map || grown) return;
    if (points.some((p) => !inBounds(BASE_BOUNDS, p) && inBounds(GROW_LIMIT, p))) {
      map.setMaxBounds(GROW_LIMIT);
      setGrown(true);
    }
  };
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
      // map-bounds-plan.md: Discover stays near Pasig. maxBounds keeps the
      // whole screen inside the box, and grows once (growIfNeeded below).
      // Rotate and tilt are off because maxBounds assumes north up: a
      // rotated map shows outside the box at the corners.
      maxBounds: BASE_BOUNDS,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
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
    // The constructor options above cover right-drag rotate and pitch;
    // these two cover the two finger twist and the keyboard.
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
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

    // map-bounds-plan.md: grow first, so the setCenter below isn't clamped
    // to the old box. A fix outside GROW_LIMIT (someone in Cebu) never
    // auto centers: the camera would clamp to the nearest box edge. The dot
    // is still placed below, it just sits off screen.
    growIfNeeded([userLocation]);

    const isFirstFix = !hasAutoCenteredRef.current;
    const isExplicitRecenter = recenterRequestId !== lastRecenterRequestIdRef.current;
    lastRecenterRequestIdRef.current = recenterRequestId;

    if (
      !customFrom &&
      !directionsPanelResult &&
      (isFirstFix || isExplicitRecenter) &&
      inBounds(GROW_LIMIT, userLocation)
    ) {
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
      cone.style.setProperty(
        "-webkit-mask-image",
        "radial-gradient(circle, black 0%, black 55%, transparent 78%)"
      );
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
    // growIfNeeded is deliberately not a dependency: it is recreated every
    // render, and it only ever grows once, so a stale copy is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <MapPin weight="fill" className="block h-10 w-10 text-primary" aria-hidden="true" />,
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
    // map-bounds-plan.md: grow before fitBounds, or fitBounds clamps to the
    // old box and crops a route that starts outside it.
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    growIfNeeded([
      { latitude: southWest.lat, longitude: southWest.lng },
      { latitude: northEast.lat, longitude: northEast.lng },
    ]);
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

  // Declutter pass (see layoutMarkers above): a separate effect
  // from the marker-build one because it must re-run on every pan, zoom
  // and resize, not only when results/isMobile change. Reads live off
  // markersRef (populated by the effect above). Runs at most once per
  // animation frame, so a fast pinch does not queue redundant passes, and
  // once more (with fresh measurements) when web fonts finish loading,
  // since label widths depend on the font.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const dimsCache = new Map<HTMLElement, LabelDims>();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        layoutMarkers(map, markersRef.current, dimsCache);
      });
    };

    schedule();
    map.on("move", schedule);
    map.on("moveend", schedule);
    map.on("resize", schedule);
    void document.fonts?.ready.then(() => {
      // Label sizes depend on the font, so re-measure once it has loaded.
      dimsCache.clear();
      schedule();
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.off("move", schedule);
      map.off("moveend", schedule);
      map.off("resize", schedule);
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
                Matching places and businesses will appear here.
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
      <ZoomControl map={mapInstance} grown={grown} />

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
