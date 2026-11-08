import { useSyncExternalStore } from "react";
import { BASE_BOUNDS, type Bounds } from "../map-style";
import { failReason, type FailReason } from "./rules";

// Offline map. The Download here stores the vector tiles, the TileJSON and the
// label fonts for Discover's locked box (BASE_BOUNDS) so the map draws with no
// connection. The worker (sw.ts, handleMap) answers from this cache first.
//
// Own cache and own meta key, so the Pasig content download, the trail packs
// and their sync never touch it. Same swap rule as runDownload: tiles go into
// a new cache and replace the old one only when everything arrived.
//
// OpenFreeMap's planet tiles stop at zoom 14, so that is the top level. The
// box is about 25 km wide, which is only a few hundred tiles in total.

const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const FONT_URL = "https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/{range}.pbf";
// Latin, Latin extended, general punctuation and the block after it. Covers
// Filipino street and place names plus dashes and quotes.
const FONT_RANGES = ["0-255", "256-511", "8192-8447", "8448-8703"];

const MIN_ZOOM = 9;
const MAX_ZOOM = 14;
const PARALLEL = 6;
// Starting guess for the size on the button, until a real download measures it.
const TILE_BYTES_GUESS = 60000;
const FONT_BYTES_GUESS = 60000;

export const MAP_CACHE_PREFIX = "map-";

export type MapPackState = "idle" | "downloading" | "downloaded" | "failed";

export interface MapPackMeta {
  state: MapPackState;
  syncedAt: number | null;
  bytes: number;
  cache: string | null;
  reason: FailReason | null;
}

const EMPTY: MapPackMeta = { state: "idle", syncedAt: null, bytes: 0, cache: null, reason: null };
const KEY = "lakbay-offline-map";

function load(): MapPackMeta {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

// useSyncExternalStore needs the same object back until something changes.
let snapshot: MapPackMeta = load();
const listeners = new Set<() => void>();

export function readMapPack(): MapPackMeta {
  return snapshot;
}

function write(next: MapPackMeta): void {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable. The state still holds for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Another tab changed it.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  snapshot = load();
  listeners.forEach((listener) => listener());
});

export function useMapPack(): MapPackMeta {
  return useSyncExternalStore(subscribe, readMapPack, readMapPack);
}

// Web Mercator tile column and row of a point at a zoom level.
function tileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

/** Every tile that touches the box, for each zoom from minZoom to maxZoom. */
export function tilesFor(box: Bounds, minZoom: number, maxZoom: number): TileCoord[] {
  const [west, south, east, north] = box;
  const out: TileCoord[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = tileX(west, z);
    const x1 = tileX(east, z);
    const y0 = tileY(north, z); // north is the smaller row
    const y1 = tileY(south, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) out.push({ z, x, y });
    }
  }
  return out;
}

/** Size for the Download button, from the tile count of the locked box. */
export function estimateMapBytes(): number {
  return tilesFor(BASE_BOUNDS, MIN_ZOOM, MAX_ZOOM).length * TILE_BYTES_GUESS + FONT_RANGES.length * FONT_BYTES_GUESS;
}

interface TileJson {
  tiles?: string[];
  maxzoom?: number;
}

let current: AbortController | null = null;

export function isMapDownloading(): boolean {
  return current !== null;
}

export function cancelMapDownload(): void {
  current?.abort();
}

export interface MapProgress {
  done: number;
  total: number;
}

async function runPool<T>(items: T[], size: number, signal: AbortSignal, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      signal.throwIfAborted();
      const item = items[next++];
      await task(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

async function dropMapCaches(keep?: string): Promise<void> {
  try {
    const names = (await caches.keys()).filter((n) => n.startsWith(MAP_CACHE_PREFIX) && n !== keep);
    await Promise.all(names.map((n) => caches.delete(n)));
  } catch {
    // No Cache API, so there is nothing to delete.
  }
}

/**
 * Stores the map for the locked box. A failed run keeps any older map and ends
 * as "failed" with a reason, a cancel goes back to what it was.
 */
export async function downloadMap(onProgress: (p: MapProgress) => void = () => undefined): Promise<void> {
  if (current) return;
  if (!("caches" in window)) {
    write({ ...EMPTY, state: "failed", reason: "unsupported" });
    return;
  }
  const controller = new AbortController();
  current = controller;
  const { signal } = controller;
  const before = readMapPack();
  write({ ...before, state: "downloading", reason: null });
  const target = `${MAP_CACHE_PREFIX}${Date.now()}`;
  let done = 0;
  let total = 0;
  let bytes = 0;
  let stored = 0;

  try {
    void navigator.storage?.persist?.();
    const cache = await caches.open(target);

    // The TileJSON first: it names the tile address and the newest zoom.
    const jsonRes = await fetch(TILEJSON_URL, { signal });
    if (!jsonRes.ok) throw new TypeError("Failed to fetch");
    const jsonText = await jsonRes.text();
    bytes += jsonText.length;
    await cache.put(
      new Request(TILEJSON_URL),
      new Response(jsonText, { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const tileJson = JSON.parse(jsonText) as TileJson;
    const template = tileJson.tiles?.[0];
    if (!template) throw new TypeError("Failed to fetch");
    const maxZoom = Math.min(MAX_ZOOM, tileJson.maxzoom ?? MAX_ZOOM);

    const urls = [
      ...FONT_RANGES.map((range) => FONT_URL.replace("{range}", range)),
      ...tilesFor(BASE_BOUNDS, MIN_ZOOM, maxZoom).map((t) =>
        template.replace("{z}", String(t.z)).replace("{x}", String(t.x)).replace("{y}", String(t.y))
      ),
    ];
    total = urls.length;
    onProgress({ done, total });

    await runPool(urls, PARALLEL, signal, async (url) => {
      const res = await fetch(url, { signal });
      // An empty or missing tile (open sea, outside coverage) is skipped, the
      // map draws it blank online as well. A dropped connection throws above.
      if (res.ok) {
        const blob = await res.blob();
        bytes += blob.size;
        stored += 1;
        await cache.put(
          new Request(url),
          new Response(blob, {
            status: 200,
            headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream" },
          })
        );
      }
      done += 1;
      onProgress({ done, total });
    });

    if (stored === 0) throw new TypeError("Failed to fetch");
    await dropMapCaches(target);
    write({ state: "downloaded", syncedAt: Date.now(), bytes, cache: target, reason: null });
  } catch (err) {
    await dropMapCaches(before.cache ?? undefined);
    if (signal.aborted) {
      write({ ...before, state: before.syncedAt ? "downloaded" : "idle", reason: null });
    } else if (before.syncedAt) {
      // The old map is still there, so keep it and its time.
      write({ ...before, state: "downloaded", reason: null });
    } else {
      write({ ...EMPTY, state: "failed", reason: failReason(err) });
    }
  } finally {
    current = null;
  }
}

export async function removeMap(): Promise<void> {
  await dropMapCaches();
  write(EMPTY);
}

/**
 * Runs once at start (initOffline): a tab closed mid download leaves
 * "downloading" behind, and the browser can clear the cache, which leaves a
 * map that says downloaded and is not there.
 */
export async function repairMapPack(): Promise<void> {
  const meta = readMapPack();
  if (meta.state === "downloading") write({ ...meta, state: meta.syncedAt ? "downloaded" : "idle" });
  try {
    const names = await caches.keys();
    const now = readMapPack();
    if (now.state === "downloaded" && !names.some((n) => n.startsWith(MAP_CACHE_PREFIX))) write(EMPTY);
  } catch {
    // No Cache API, nothing could have been downloaded.
  }
}
