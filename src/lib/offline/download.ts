import { supabase } from "../supabase";
import { readMeta, writeMeta } from "./meta";
import { isOnline } from "./status";
import { pool, pullAll, pullTrail } from "./reads";
import {
  afterPackGone,
  afterPackSync,
  afterSync,
  contentCacheName,
  estimateBytes,
  failReason,
  isCacheOfTrail,
  isContentCache,
  isTrailCache,
  trailCacheName,
  withoutContent,
  withoutPack,
} from "./rules";
import { endTrailJob, failTrailJob, getTrailJob, progressTrailJob, startTrailJob } from "./trail-jobs";

const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface Progress {
  done: number;
  total: number;
}

let current: AbortController | null = null;

export function isDownloading(): boolean {
  return current !== null;
}

export function cancelDownload(): void {
  current?.abort();
}

function unsupported(): Error {
  const err = new Error("This browser cannot keep content offline.");
  err.name = "UnsupportedError";
  return err;
}

// The worker has to control the page, or it cannot store what the page reads.
async function ensureWorker(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("caches" in window)) throw unsupported();
  if (!(await navigator.serviceWorker.getRegistration())) throw unsupported();
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
      setTimeout(resolve, 3000);
    });
  }
  if (!navigator.serviceWorker.controller) throw unsupported();
}

function post(message: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = Math.random();
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      reject(new Error("The offline worker did not answer."));
    }, 3000);
    function onMessage(e: MessageEvent): void {
      if (e.data?.id !== id) return;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve();
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.controller?.postMessage({ ...message, id });
  });
}

async function dropCache(name: string): Promise<void> {
  try {
    await caches.delete(name);
  } catch {
    // No Cache API, so there is nothing to delete.
  }
}

// The worker holds one download setting at a time, so runs take turns: a trail
// download waits for the Pasig download or sync, and the other way round.
let tail: Promise<void> = Promise.resolve();
function acquire(): Promise<() => void> {
  const previous = tail;
  let release: () => void = () => undefined;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  return previous.then(() => release);
}

// Thumbnails, 6 at a time, through CORS so the browser counts their real size.
// A missing one (a photo from before the backfill) is skipped.
async function fetchThumbs(urls: string[], signal: AbortSignal, tick: () => void): Promise<void> {
  await pool(urls, 6, signal, async (url) => {
    try {
      await fetch(url, { mode: "cors", signal });
    } catch (err) {
      if (signal.aborted) throw err;
    }
    tick();
  });
}

/**
 * One run, for both the Download button and the daily sync. It pulls into a
 * new cache and swaps only when everything arrived. A failed sync keeps the old
 * data and the old time. A failed first download ends as "failed" with a reason.
 */
export async function runDownload(mode: "download" | "sync", onProgress: (p: Progress) => void = () => undefined): Promise<void> {
  if (current) return;
  const controller = new AbortController();
  current = controller;
  const before = readMeta();
  // Shown at once, even when a trail download has the worker for a moment.
  if (mode === "download") writeMeta({ ...before, state: "downloading", reason: null });
  let release: () => void = () => undefined;
  const target = contentCacheName(Date.now());
  let done = 0;
  let total = 0;
  let modeOn = false;
  const report = () => onProgress({ done, total });
  const stop = async () => {
    if (!modeOn) return;
    modeOn = false;
    await post({ type: "download-end" }).catch(() => undefined);
  };

  try {
    release = await acquire();
    controller.signal.throwIfAborted();
    await ensureWorker();
    void navigator.storage?.persist?.();
    await post({ type: "download-start", anon: SUPABASE_ANON, target });
    modeOn = true;

    const thumbs = await pullAll({
      signal: controller.signal,
      add: (n) => {
        total += n;
        report();
      },
      tick: () => {
        done += 1;
        report();
      },
    });
    total += thumbs.length;
    report();
    await fetchThumbs(thumbs, controller.signal, () => {
      done += 1;
      report();
    });
    // Some reads swallow their errors, so a connection lost mid-way would
    // leave gaps without a throw.
    if (!isOnline()) throw new TypeError("Failed to fetch");

    await stop();
    for (const name of await caches.keys()) {
      if (isContentCache(name) && name !== target) await caches.delete(name);
    }
    writeMeta(afterSync(readMeta(), { cache: target }, Date.now()));
  } catch (err) {
    await stop();
    await dropCache(target);
    const keep = mode === "sync" || before.syncedAt !== null;
    // readMeta, not before: a trail download that ran while this one waited
    // may have changed meta.trails since.
    if (controller.signal.aborted) {
      writeMeta({ ...readMeta(), state: before.syncedAt ? "downloaded" : "idle", reason: null });
    } else if (keep) {
      writeMeta(afterSync(readMeta(), null, Date.now()));
    } else {
      writeMeta({ ...readMeta(), state: "failed", reason: failReason(err) });
    }
  } finally {
    await stop();
    current = null;
    release();
  }
}

export function downloadAll(onProgress: (p: Progress) => void): Promise<void> {
  return runDownload("download", onProgress);
}

// Photos seen online are kept while anything is downloaded (sw.ts, PHOTOS).
const PHOTOS = "photos-runtime";

// Removes the Pasig download only. Downloaded trails have their own Remove, so
// they stay, and so do the photos they may need.
export async function removeDownload(): Promise<void> {
  const keepTrails = readMeta().trails.length > 0;
  for (const name of await caches.keys()) {
    if (isContentCache(name) || (!keepTrails && (name === PHOTOS || isTrailCache(name)))) await caches.delete(name);
  }
  writeMeta(withoutContent(readMeta()));
}

async function dropTrailCaches(id: string, keep?: string): Promise<void> {
  for (const name of await caches.keys()) {
    if (isCacheOfTrail(name, id) && name !== keep) await caches.delete(name);
  }
}

export async function removeTrail(id: string): Promise<void> {
  await dropTrailCaches(id);
  const next = withoutPack(readMeta(), id);
  writeMeta(next);
  if (next.trails.length === 0 && next.state !== "downloaded") await dropCache(PHOTOS);
}

// The real size of a cache, for the size shown beside a downloaded trail.
async function cacheBytes(name: string): Promise<number> {
  const cache = await caches.open(name);
  let bytes = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response) bytes += (await response.arrayBuffer()).byteLength;
  }
  return bytes;
}

const syncingTrails = new Set<string>();

/**
 * One trail pack (offline-phases.md, Phase 7.2), for the trail page button and
 * the daily sync. Same shape as runDownload: it pulls into a new cache named
 * trail-<id>-<time> and swaps only when everything arrived. A failed sync
 * keeps the old pack and its time. A trail that is not published any more is
 * dropped, and its name is kept for the modal to say so.
 */
async function runTrail(id: string, mode: "download" | "sync"): Promise<void> {
  const visible = mode === "download";
  if (visible ? getTrailJob(id)?.status === "downloading" : syncingTrails.has(id)) return;
  const controller = new AbortController();
  if (visible) startTrailJob(id, controller);
  else syncingTrails.add(id);

  const target = trailCacheName(id, Date.now());
  let done = 0;
  let total = 0;
  let modeOn = false;
  let release: () => void = () => undefined;
  const report = () => {
    if (visible) progressTrailJob(id, done, total);
  };
  const stop = async () => {
    if (!modeOn) return;
    modeOn = false;
    await post({ type: "download-end" }).catch(() => undefined);
  };

  try {
    release = await acquire();
    controller.signal.throwIfAborted();
    await ensureWorker();
    void navigator.storage?.persist?.();
    await post({ type: "download-start", anon: SUPABASE_ANON, target });
    modeOn = true;

    const pulled = await pullTrail(id, {
      signal: controller.signal,
      add: (n) => {
        total += n;
        report();
      },
      tick: () => {
        done += 1;
        report();
      },
    });
    if (!pulled) {
      await stop();
      await dropCache(target);
      await dropTrailCaches(id);
      writeMeta(afterPackGone(readMeta(), id));
      if (visible) failTrailJob(id, "gone");
      return;
    }

    total += pulled.thumbs.length;
    report();
    await fetchThumbs(pulled.thumbs, controller.signal, () => {
      done += 1;
      report();
    });
    if (!isOnline()) throw new TypeError("Failed to fetch");

    await stop();
    const bytes = await cacheBytes(target);
    await dropTrailCaches(id, target);
    writeMeta(afterPackSync(readMeta(), id, { name: pulled.name, cache: target, bytes }, Date.now()));
    if (visible) endTrailJob(id);
  } catch (err) {
    await stop();
    await dropCache(target);
    if (controller.signal.aborted) {
      if (visible) endTrailJob(id);
    } else if (visible) {
      failTrailJob(id, failReason(err));
    } else {
      writeMeta(afterPackSync(readMeta(), id, null, Date.now()));
    }
  } finally {
    await stop();
    syncingTrails.delete(id);
    release();
  }
}

export function downloadTrail(id: string): Promise<void> {
  return runTrail(id, "download");
}

export function refreshTrail(id: string): Promise<void> {
  return runTrail(id, "sync");
}

// Size for the Download button. Head requests count rows without fetching
// them. Guests see published rows only, so this is the Guest size, which is
// what Download stores.
export async function estimateDownloadBytes(): Promise<number | null> {
  const head = { count: "exact" as const, head: true };
  const [places, businesses, events, trails] = await Promise.all([
    supabase.from("places").select("id", head),
    supabase.from("businesses").select("id", head),
    supabase.from("events").select("id", head).eq("published", true),
    supabase.from("routes").select("id", head).eq("personal", false),
  ]);
  if (places.error || businesses.error || events.error || trails.error) return null;
  const p = places.count ?? 0;
  const b = businesses.count ?? 0;
  return estimateBytes({ places: p, businesses: b, events: events.count ?? 0, trails: trails.count ?? 0, covers: p + b });
}
