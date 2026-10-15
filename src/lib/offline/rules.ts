// Pure rules for offline use (offline-phases.md, Phase 4). No imports, so
// scripts/offline-check.mjs can run this file in plain Node. Everything that
// touches the browser lives in the other files of this folder.

export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
// After a failed sync, wait this long before trying again, so a flapping
// connection does not start a download every few seconds.
export const RETRY_GAP_MS = 10 * 60 * 1000;

export type OfflineState = "idle" | "downloading" | "downloaded" | "failed";
// "gone" is only a trail download of a trail that is no longer published.
export type FailReason = "network" | "storage_full" | "unsupported" | "unknown" | "gone";

// One downloaded trail (Phase 7). Each has its own cache, size and sync time,
// so it can be removed or refreshed without touching the Pasig download.
export interface TrailPack {
  id: string;
  name: string;
  // Name of the active cache of this trail.
  cache: string;
  bytes: number;
  syncedAt: number;
  attemptedAt: number | null;
}

export interface OfflineMeta {
  state: OfflineState;
  // Last good download or sync. Stays put when a sync fails.
  syncedAt: number | null;
  attemptedAt: number | null;
  // Name of the active content cache.
  cache: string | null;
  // Downloaded trails (Phase 7). Independent of the Pasig download above.
  trails: TrailPack[];
  // Names of downloaded trails a sync found removed. The modal shows them once.
  gone: string[];
  reason: FailReason | null;
}

export const EMPTY_META: OfflineMeta = {
  state: "idle",
  syncedAt: null,
  attemptedAt: null,
  cache: null,
  trails: [],
  gone: [],
  reason: null,
};

export function contentCacheName(now: number): string {
  return `content-${now}`;
}

export function isContentCache(name: string): boolean {
  return name.startsWith("content-");
}

export function shouldSync(meta: OfflineMeta, now: number, online: boolean): boolean {
  if (!online || meta.state !== "downloaded" || meta.syncedAt === null) return false;
  if (now - meta.syncedAt < SYNC_INTERVAL_MS) return false;
  return meta.attemptedAt === null || now - meta.attemptedAt >= RETRY_GAP_MS;
}

// A good sync swaps in the new cache and the new time. A failed one changes
// nothing but the attempt time, so the old data and the old time stay.
export function afterSync(meta: OfflineMeta, ok: { cache: string } | null, now: number): OfflineMeta {
  if (!ok) return { ...meta, attemptedAt: now };
  return { ...meta, state: "downloaded", syncedAt: now, attemptedAt: now, cache: ok.cache, reason: null };
}

// The browser can clear site data. If meta says downloaded but no content
// cache is left, the download is gone.
export function isEvicted(meta: OfflineMeta, cacheNames: string[]): boolean {
  return meta.state === "downloaded" && !cacheNames.some(isContentCache);
}

// Removing the Pasig download leaves downloaded trails alone.
export function withoutContent(meta: OfflineMeta): OfflineMeta {
  return { ...EMPTY_META, trails: meta.trails, gone: meta.gone };
}

export function trailCacheName(id: string, now: number): string {
  return `trail-${id}-${now}`;
}

export function isTrailCache(name: string): boolean {
  return name.startsWith("trail-");
}

// Every cache a trail has had, so a refresh can delete the old one.
export function isCacheOfTrail(name: string, id: string): boolean {
  return name.startsWith(`trail-${id}-`);
}

// A good download or sync replaces the pack. A failed sync changes nothing but
// the attempt time, so the old data and the old time stay.
export function afterPackSync(
  meta: OfflineMeta,
  id: string,
  ok: { name: string; cache: string; bytes: number } | null,
  now: number
): OfflineMeta {
  if (!ok) {
    return { ...meta, trails: meta.trails.map((p) => (p.id === id ? { ...p, attemptedAt: now } : p)) };
  }
  const pack: TrailPack = { id, name: ok.name, cache: ok.cache, bytes: ok.bytes, syncedAt: now, attemptedAt: now };
  const rest = meta.trails.filter((p) => p.id !== id);
  return { ...meta, trails: [...rest, pack] };
}

export function withoutPack(meta: OfflineMeta, id: string): OfflineMeta {
  return { ...meta, trails: meta.trails.filter((p) => p.id !== id) };
}

// A sync found the trail removed: drop the pack and remember its name.
export function afterPackGone(meta: OfflineMeta, id: string): OfflineMeta {
  const pack = meta.trails.find((p) => p.id === id);
  if (!pack) return meta;
  return { ...withoutPack(meta, id), gone: [...meta.gone, pack.name] };
}

// Packs whose daily sync is due: online, a day since the last good sync, and
// not tried in the last RETRY_GAP_MS.
export function packsDue(meta: OfflineMeta, now: number, online: boolean): string[] {
  if (!online) return [];
  return meta.trails
    .filter(
      (p) =>
        now - p.syncedAt >= SYNC_INTERVAL_MS && (p.attemptedAt === null || now - p.attemptedAt >= RETRY_GAP_MS)
    )
    .map((p) => p.id);
}

// The browser can clear one cache and keep another. A pack with no cache left
// is gone. Returns the same object when nothing changed.
export function prunePacks(meta: OfflineMeta, cacheNames: string[]): OfflineMeta {
  const kept = meta.trails.filter((p) => cacheNames.includes(p.cache));
  return kept.length === meta.trails.length ? meta : { ...meta, trails: kept };
}

// The time the offline notice shows: the Pasig download when there is one,
// else the newest downloaded trail.
export function savedAt(meta: OfflineMeta): number | null {
  if (meta.state === "downloaded" && meta.syncedAt !== null) return meta.syncedAt;
  return meta.trails.length ? Math.max(...meta.trails.map((p) => p.syncedAt)) : null;
}

export function failReason(err: unknown): FailReason {
  const name = err instanceof Error ? err.name : "";
  const message = String((err as { message?: unknown } | null)?.message ?? "");
  if (name === "UnsupportedError") return "unsupported";
  if (name === "QuotaExceededError" || /quota/i.test(message)) return "storage_full";
  if (err instanceof TypeError || /failed to fetch|network|load failed/i.test(message)) return "network";
  return "unknown";
}

// Starting numbers for the size shown on the Download button. Replace them
// with the measured ones after scripts/make-thumbs.mjs (Phase 2.8) and the
// device tests (Phase 10.8).
const PLACE_BYTES = 4000;
const BUSINESS_BYTES = 5000;
const EVENT_BYTES = 2000;
const TRAIL_BYTES = 40000;
const THUMB_BYTES = 40000;
const FIXED_BYTES = 200000;

export function estimateBytes(counts: {
  places: number;
  businesses: number;
  events: number;
  trails: number;
  covers: number;
}): number {
  return (
    FIXED_BYTES +
    counts.places * PLACE_BYTES +
    counts.businesses * BUSINESS_BYTES +
    counts.events * EVENT_BYTES +
    counts.trails * TRAIL_BYTES +
    counts.covers * THUMB_BYTES
  );
}

// Size for a trail's Download button, from what the trail page already holds:
// its stops and the entries that carry a photo. About three thumbnails per
// stop (its place or business photos). Same starting numbers as above.
const TRAIL_FIXED_BYTES = 20000;
const TRAIL_STOP_BYTES = PLACE_BYTES + 3 * THUMB_BYTES;

export function estimateTrailBytes(counts: { stops: number; entryPhotos: number }): number {
  return TRAIL_FIXED_BYTES + counts.stops * TRAIL_STOP_BYTES + counts.entryPhotos * THUMB_BYTES;
}

export function formatSize(bytes: number): string {
  const mb = bytes / 1048576;
  if (mb < 1) return "under 1 MB";
  const rounded = mb < 10 ? Math.round(mb) : Math.round(mb / 5) * 5;
  return `about ${rounded} MB`;
}

// The detail pages read their record inline. Download replays the same reads
// (reads.ts) so the stored URLs match what the pages ask for. These are the
// select strings, copied from the pages. PAGE_CONTRACTS lists, per page, the
// pieces of each read that reads.ts repeats. scripts/offline-check.mjs fails if
// a page changes one of them, which is the signal to update reads.ts.
export const PLACE_SELECT =
  "id, name, address, latitude, longitude, description, historical_background, historical_significance, year_or_period, source_reference, operating_hours, entrance_fee, rules, verification_status, place_categories(name), facility_ids";
export const BUSINESS_SELECT =
  "id, name, address, latitude, longitude, description, opening_hours, contact, rules, business_story, unique_specialty, business_type, verification_status, business_categories(name)";
export const EVENT_SELECT =
  "id, title, description, date_time, location, enrollment_info, related_place_id, places(name), event_categories(name)";
export const ITEMS_SELECT = "id, name, price, photos:business_item_photos(id, photo_url)";

export const PAGE_CONTRACTS: { file: string; snippets: string[] }[] = [
  {
    file: "src/pages/discover-place-detail.tsx",
    snippets: [
      `"${PLACE_SELECT}"`,
      '.from("places")',
      '.eq("id", id)',
      ".maybeSingle()",
      '.from("place_photos")',
      '.select("photo_url")',
      '.eq("place_id", id)',
      '.order("sort_order", { ascending: true })',
    ],
  },
  {
    file: "src/pages/discover-business-detail.tsx",
    snippets: [
      `"${BUSINESS_SELECT}"`,
      '.from("businesses")',
      '.eq("id", id)',
      ".maybeSingle()",
      '.from("business_items")',
      `"${ITEMS_SELECT}"`,
      '.eq("business_id", id)',
      '.order("sort_order", { referencedTable: "business_item_photos" })',
      '.from("business_photos")',
      '.select("photo_url")',
      '.order("sort_order", { ascending: true })',
    ],
  },
  {
    file: "src/pages/event-detail.tsx",
    snippets: [`"${EVENT_SELECT}"`, '.from("events")', '.eq("id", id)', '.eq("published", true)', ".maybeSingle()"],
  },
  {
    file: "src/pages/fiesta-detail.tsx",
    snippets: ['.from("places")', '.select("name")', '.eq("id", relatedPlaceId)', ".maybeSingle()"],
  },
  // A trail download stores one entry read per QR token. pullTrail calls
  // fetchEntryByToken itself, so only the function's own body can drift.
  {
    file: "src/lib/entry-unlocks.ts",
    snippets: ['.from("discovery_content")', '"id, related_location_type, related_location_id"', '.eq("qr_token", token)'],
  },
];
