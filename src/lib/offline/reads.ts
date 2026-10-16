import { supabase } from "../supabase";
import { fetchDiscoverResults } from "../discover-query";
import { fetchAnnouncements, fetchHomeShowcase } from "../home-query";
import { fetchCredentialNamesByRouteId, fetchPublishedTrails, fetchTrailDetail } from "../trail-query";
import { fetchEntryByToken } from "../entry-unlocks";
import type { TrailStop } from "../trail-types";
import { BARANGAYS, fetchPublishedFiesta, fetchPublishedFiestasForBarangay, type PublicFiesta } from "../fiestas";
import { fetchActiveSlides } from "../landing-slides";
import { fetchActiveCategories as fetchActiveFacilities } from "../place-facilities";
import { fetchActiveCategories as fetchPlaceCategories } from "../place-categories";
import { fetchActiveCategories as fetchBusinessCategories } from "../business-categories";
import { fetchActiveCategories as fetchEventCategories } from "../event-categories";
import { thumbUrl } from "../photo-thumb";
import { BUSINESS_SELECT, EVENT_SELECT, ITEMS_SELECT, PLACE_SELECT, failReason } from "./rules";

/**
 * What a Pasig download reads (offline-phases.md, Phase 4.7). Each read is the
 * same call a page makes, so the worker stores the URL the page will ask for
 * when offline. The list reads reuse the app's own functions. The detail pages
 * read inline, so those reads are repeated here, and
 * scripts/offline-check.mjs fails if a page drifts from them.
 *
 * One GET per record (offline-plan.md, 1.3 choice A). Trail details are read
 * here as text. pullTrail (below) adds the extras a trail walk needs.
 */

export interface PullHooks {
  signal: AbortSignal;
  add(count: number): void;
  tick(): void;
}

// One read. PromiseLike and not Promise: a supabase-js query's .then() returns
// a PromiseLike (no .catch or .finally), and every job is only awaited.
type Job = () => PromiseLike<unknown>;

// A failed read comes back as an error object, not a throw. Only a network
// failure should stop the download. A missing row is just a missing row.
function ok<T extends { error: unknown }>(res: T): T {
  if (res.error && failReason(res.error) === "network") throw res.error;
  return res;
}

async function soft(run: () => PromiseLike<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (failReason(err) === "network") throw err;
  }
}

export async function pool<T>(
  items: T[],
  size: number,
  signal: AbortSignal,
  fn: (item: T) => Promise<unknown>
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      signal.throwIfAborted();
      // Each worker takes the next item only after finishing its last one, which
      // is what limits the pool to `size` reads at a time.
      await fn(items[next++]); // NOSONAR
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

const placeDetail = (id: string) => supabase.from("places").select(PLACE_SELECT).eq("id", id).maybeSingle().then(ok);
const placePhotos = (id: string) =>
  supabase.from("place_photos").select("photo_url").eq("place_id", id).order("sort_order", { ascending: true }).then(ok);
const businessDetail = (id: string) =>
  supabase.from("businesses").select(BUSINESS_SELECT).eq("id", id).maybeSingle().then(ok);
const businessItems = (id: string) =>
  supabase
    .from("business_items")
    .select(ITEMS_SELECT)
    .eq("business_id", id)
    .order("sort_order", { referencedTable: "business_item_photos" })
    .then(ok);
const businessPhotos = (id: string) =>
  supabase.from("business_photos").select("photo_url").eq("business_id", id).order("sort_order", { ascending: true }).then(ok);
const eventDetail = (id: string) =>
  supabase.from("events").select(EVENT_SELECT).eq("id", id).eq("published", true).maybeSingle().then(ok);
const relatedPlaceName = (id: string) => supabase.from("places").select("name").eq("id", id).maybeSingle().then(ok);

// The reads a place or business detail page makes. Shared by the Pasig
// download and a trail pack. `onPhoto` hears each photo url the rows list.
function recordJobs(
  kind: "place" | "business",
  id: string,
  onPhoto?: (url: string) => void
): Job[] {
  const photos = (res: { data: { photo_url: string }[] | null }) => {
    for (const row of res.data ?? []) onPhoto?.(row.photo_url);
  };
  if (kind === "place") return [() => placeDetail(id), () => placePhotos(id).then(photos)];
  return [() => businessDetail(id), () => businessItems(id), () => businessPhotos(id).then(photos)];
}

// Returns the thumbnail urls to fetch next (one cover photo per record).
export async function pullAll({ signal, add, tick }: PullHooks): Promise<string[]> {
  const run = async <T>(promise: Promise<T>): Promise<T> => {
    const value = await promise;
    tick();
    return value;
  };

  // Lists and directories, one request each.
  add(9);
  const [results, events, trails] = await Promise.all([
    run(fetchDiscoverResults()),
    run(fetchAnnouncements()),
    run(fetchPublishedTrails()),
    run(fetchHomeShowcase()),
    run(fetchActiveSlides()),
    run(fetchActiveFacilities()),
    run(fetchPlaceCategories()),
    run(fetchBusinessCategories()),
    run(fetchEventCategories()),
  ]);

  // Fiestas are listed per barangay (the barangay hall pages read them so).
  add(BARANGAYS.length);
  const fiestas = new Map<string, PublicFiesta>();
  await pool([...BARANGAYS], 6, signal, async (barangay) => {
    for (const fiesta of await fetchPublishedFiestasForBarangay(barangay)) fiestas.set(fiesta.id, fiesta);
    tick();
  });

  // One set of reads per record.
  const jobs: Job[] = [];
  for (const row of results) jobs.push(...recordJobs(row.kind, row.id));
  for (const event of events) jobs.push(() => eventDetail(event.id));
  for (const trail of trails) jobs.push(() => soft(() => fetchTrailDetail(trail.id)));
  for (const fiesta of fiestas.values()) {
    jobs.push(async () => {
      const full = await fetchPublishedFiesta(fiesta.id);
      if (full?.related_place_id) await relatedPlaceName(full.related_place_id);
    });
  }
  add(jobs.length);
  await pool(jobs, 6, signal, async (job) => {
    await job();
    tick();
  });

  const covers = new Set<string>();
  for (const row of results) if (row.coverPhotoUrl) covers.add(thumbUrl(row.coverPhotoUrl));
  return [...covers];
}

// Tokens of the QR entries at a trail's stops. Entries and tokens are readable
// by anyone (discovery_content_select_public), so storing them exposes nothing
// new. Same filter as trail-query.ts's place entries, so the rows are the ones
// the trail page shows.
async function entryTokens(stops: TrailStop[]): Promise<string[]> {
  const ids = [...new Set(stops.map((s) => s.stop_id))];
  if (ids.length === 0) return [];
  const res = await supabase
    .from("discovery_content")
    .select("qr_token")
    .is("route_id", null)
    .eq("status", "active")
    .in("related_location_id", ids)
    .not("qr_token", "is", null)
    .then(ok);
  const tokens = ((res.data ?? []) as { qr_token: string | null }[]).map((row) => row.qr_token);
  return tokens.filter((token): token is string => token !== null);
}

/**
 * What one trail download reads (offline-phases.md, Phase 7.1): the trail page
 * read, the credential name, the place or business detail and photo rows of
 * every stop, and one entry read per QR token (so a scanned code can be checked
 * against the device in Phase 8.8). Returns null when the trail is not
 * published any more. Otherwise the name and the thumbnail urls to fetch next:
 * the stops' photos (their cover first) and the entries' photos.
 */
export async function pullTrail(
  id: string,
  { signal, add, tick }: PullHooks
): Promise<{ name: string; thumbs: string[] } | null> {
  add(1);
  const detail = await fetchTrailDetail(id);
  tick();
  if (!detail) return null;

  const thumbs = new Set<string>();
  const addPhoto = (url: string | null) => {
    if (url) thumbs.add(thumbUrl(url));
  };
  for (const stop of detail.stops) for (const entry of stop.discoveryContent) addPhoto(entry.photoUrl);

  // A trail can stop at the same place twice. One set of reads is enough.
  const locations = new Map<string, TrailStop>();
  for (const stop of detail.stops) locations.set(`${stop.stop_type}:${stop.stop_id}`, stop);

  add(1);
  const tokens = await entryTokens([...locations.values()]);
  tick();

  // These two throw on any error, so a network failure stops the download and
  // anything else is only a missing read.
  const jobs: Job[] = [() => soft(() => fetchCredentialNamesByRouteId([id]))];
  for (const stop of locations.values()) jobs.push(...recordJobs(stop.stop_type, stop.stop_id, addPhoto));
  for (const token of tokens) jobs.push(() => soft(() => fetchEntryByToken(token)));
  add(jobs.length);
  await pool(jobs, 6, signal, async (job) => {
    await job();
    tick();
  });

  return { name: detail.name, thumbs: [...thumbs] };
}
