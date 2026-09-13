// Pure math for the "Portal" looping filmstrip, ported unchanged from
// Qula's src/components/sections/work.tsx (loopIndex, wrappedSlot,
// tileOffsetPx/tileWidthPx). Extracted from announcement-carousel.tsx so
// the wraparound logic -- the actual non-trivial part of the port -- can
// carry its own runnable self-check, same convention src/lib/preferences.ts
// already established (ponytail's non-trivial-logic rule: a branch, a
// loop, or a parser gets one small demo()/__main__ check, no framework).

// Given a raw tick and a list length, returns the looped index (always >= 0).
export function loopIndex(tick: number, length: number): number {
  return ((tick % length) + length) % length;
}

// A tile's live horizontal slot, in tile-units. `raw` is the tile's
// distance from the strip's live position, wrapped to the shortest path
// around the loop, re-based so the center slot sits at tile-unit 0. This
// is what makes a tile exiting the left edge reappear on the right (and
// vice versa) as one continuous motion instead of a teleport: the formula
// is re-evaluated every frame, not just on index change.
export function wrappedSlot(baseIndex: number, length: number, liveOffset: number): number {
  const half = length / 2;
  let raw = (((baseIndex - liveOffset) % length) + length) % length;
  if (raw >= half) raw -= length;
  if (raw < -half) raw += length;
  return raw;
}

// Shortest signed step from `prev` to `index` around a loop of `length`
// items, so wrapping from the last item to the first (or vice versa)
// animates one tile-width in the natural direction instead of spinning
// back through the whole strip.
export function shortestStep(prev: number, index: number, length: number): number {
  const rawDelta = index - prev;
  const half = length / 2;
  let delta = (((rawDelta + half) % length) + length) % length - half;
  if (delta === -half) delta = half; // keep wrap direction consistent at the exact midpoint
  return delta;
}

// A tile's pixel width, given the live measured container width, how many
// tile-widths the viewport shows at once, and the fixed gap between tiles.
export function tileWidthPx(containerWidthPx: number, tilesInViewport: number, gapPx: number): number {
  return (containerWidthPx - (tilesInViewport - 1) * gapPx) / tilesInViewport;
}

// A tile's left offset in pixels for a given slot (continuous during
// animation, 0 = center of the viewport).
export function tileOffsetPx(
  slot: number,
  containerWidthPx: number,
  tilesInViewport: number,
  gapPx: number
): number {
  const tw = tileWidthPx(containerWidthPx, tilesInViewport, gapPx);
  const centered = slot + (tilesInViewport - 1) / 2;
  return centered * (tw + gapPx);
}

// Smallest runnable check for the math above, ponytail's non-trivial-logic
// rule. Run standalone with: npx tsx src/lib/filmstrip.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${expected}, got ${actual}`);
    }
  };

  // loopIndex wraps both directions.
  assertEqual(loopIndex(0, 3), 0, "loopIndex(0, 3)");
  assertEqual(loopIndex(3, 3), 0, "loopIndex(3, 3)");
  assertEqual(loopIndex(-1, 3), 2, "loopIndex(-1, 3)");
  assertEqual(loopIndex(7, 3), 1, "loopIndex(7, 3)");

  // wrappedSlot: the current index sits at slot 0, and slots wrap to the
  // shortest signed distance -- with 4 items, item 3 relative to a live
  // offset of 0 is 1 step *behind* (-1), not 3 steps ahead.
  assertEqual(wrappedSlot(0, 4, 0), 0, "wrappedSlot(0, 4, 0)");
  assertEqual(wrappedSlot(1, 4, 0), 1, "wrappedSlot(1, 4, 0)");
  assertEqual(wrappedSlot(3, 4, 0), -1, "wrappedSlot(3, 4, 0)");
  // As liveOffset moves continuously past an integer index, the formula
  // stays continuous too (no jump at the boundary).
  assertEqual(wrappedSlot(1, 4, 0.5), 0.5, "wrappedSlot(1, 4, 0.5)");

  // shortestStep picks the shorter wrap direction, e.g. 0 -> 3 on a
  // 4-item loop should step -1 (backward), not +3 (forward).
  assertEqual(shortestStep(0, 3, 4), -1, "shortestStep(0, 3, 4)");
  assertEqual(shortestStep(3, 0, 4), 1, "shortestStep(3, 0, 4)");
  assertEqual(shortestStep(0, 1, 4), 1, "shortestStep(0, 1, 4)");

  // Tile geometry: 3 equal tiles in a 300px viewport with a 0px gap are
  // each 100px wide; center tile (slot 0) sits at x=100.
  assertEqual(tileWidthPx(300, 3, 0), 100, "tileWidthPx(300, 3, 0)");
  assertEqual(tileOffsetPx(0, 300, 3, 0), 100, "tileOffsetPx(0, 300, 3, 0)");
  // Single-tile-viewport (this codebase's Announcements carousel): the
  // one visible tile always sits flush at x=0.
  assertEqual(tileWidthPx(300, 1, 12), 300, "tileWidthPx(300, 1, 12)");
  assertEqual(tileOffsetPx(0, 300, 1, 12), 0, "tileOffsetPx(0, 300, 1, 12)");

  console.log("filmstrip.ts demo: all checks passed");
}

// Only run when this file is executed directly, never on import, same
// guard shape as src/lib/preferences.ts (the `typeof process` check
// short-circuits in the Vite browser bundle, where `process` doesn't exist).
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
