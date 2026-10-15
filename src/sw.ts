/**
 * Service worker for offline use (offline-phases.md, Phases 3 and 4).
 *
 * Shell: holds the built app files so the app opens with no connection.
 * Content: Supabase reads and photos. Browsing never writes to the data cache.
 * Only a Download (or the daily sync) does, and it stores what a Guest sees,
 * so a signed in user's rows are never kept for the next person on the phone.
 * A user's own tables (OWN_TABLES) skip the data cache altogether.
 *
 * Built by vite-plugin-pwa (injectManifest), which fills self.__WB_MANIFEST
 * with every built file. No Workbox runtime is imported, so the worker is one
 * small file. The shell cache name carries a hash of that list, so each build
 * gets its own cache and old ones are deleted on activate.
 *
 * No skipWaiting: a new version waits until the app is closed, then applies on
 * the next open. An open tab never loses its files halfway through.
 */
interface PrecacheEntry {
  url: string;
  revision: string | null;
}
interface Waitable extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEv extends Waitable {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface MessageEv extends Waitable {
  data: { type?: string; id?: number; anon?: string; target?: string } | null;
  source: { postMessage(message: unknown): void } | null;
}
// This file is built for a worker, where self is the worker scope. The DOM
// typings used by the rest of src do not describe it, so declare what is used.
declare const self: {
  __WB_MANIFEST: PrecacheEntry[];
  addEventListener(type: string, listener: (event: Event) => void): void;
  clients: {
    claim(): Promise<void>;
    matchAll(): Promise<{ postMessage(message: unknown): void }[]>;
  };
  location: Location;
};

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const origin = self.location.origin;
const entries = self.__WB_MANIFEST.map((e) => ({
  url: new URL(e.url, origin + "/").href,
  revision: e.revision,
}));
const SHELL = "shell-" + hash(entries.map((e) => e.url + (e.revision ?? "")).join("|"));
const INDEX = new URL("index.html", origin + "/").href;
const shellUrls = new Set(entries.map((e) => e.url));

// Marker cache. While it exists, a Download is running and holds its settings.
// A cache and not a variable, because the browser can stop the worker at any
// time and a variable would reset with it.
const DL = "dl-mode";
// Photos seen online once a download exists, so they show offline. Capped.
const PHOTOS = "photos-runtime";
const PHOTO_CAP = 200;
const THUMB_SUFFIX = ".thumb.webp";
// On a weak signal a read would hang. After this long, fall back to the copy.
const NET_TIMEOUT_MS = 8000;

interface DownloadSettings {
  anon: string;
  target: string;
}

self.addEventListener("install", (event) => {
  const work = caches
    .open(SHELL)
    .then((cache) => cache.addAll(entries.map((e) => new Request(e.url, { cache: "reload" }))));
  (event as Waitable).waitUntil(work);
});

// Safe to claim: a new version only activates once no tab uses the old one.
self.addEventListener("activate", (event) => {
  const work = (async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("shell-") && name !== SHELL) await caches.delete(name);
    }
    await self.clients.claim();
  })();
  (event as Waitable).waitUntil(work);
});

// The page starts and ends a download. The reply lets it wait for the switch.
self.addEventListener("message", (event) => {
  const e = event as MessageEv;
  const m = e.data;
  if (!m || (m.type !== "download-start" && m.type !== "download-end")) return;
  const work = (async () => {
    if (m.type === "download-start") {
      const cache = await caches.open(DL);
      await cache.put("/cfg", new Response(JSON.stringify({ anon: m.anon, target: m.target })));
    } else {
      await caches.delete(DL);
    }
    e.source?.postMessage({ id: m.id });
  })();
  e.waitUntil(work);
});

// Key stored responses by the bare address. Keying by the page's own request
// would write the user's token into the cache with it.
function bare(url: string): Request {
  return new Request(url);
}

async function downloadSettings(): Promise<DownloadSettings | null> {
  if (!(await caches.has(DL))) return null;
  const hit = await (await caches.open(DL)).match("/cfg");
  return hit ? ((await hit.json()) as DownloadSettings) : null;
}

async function hasStoredContent(): Promise<boolean> {
  return (await caches.keys()).some((n) => n.startsWith("content-") || n.startsWith("trail-"));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TypeError("Network timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Tell open pages when the network fails or comes back, so the app can show
// the offline notice even when the browser still reports online. Only changes
// are sent.
let lastNet: "ok" | "fail" | null = null;
async function tell(state: "ok" | "fail"): Promise<void> {
  if (state === lastNet) return;
  lastNet = state;
  for (const client of await self.clients.matchAll()) {
    client.postMessage({ type: state === "ok" ? "net-ok" : "net-fail" });
  }
}

// Download mode: ask Supabase as a Guest and store the answer. Only a Guest
// view is ever stored (offline-plan.md, decided in review 1).
async function storeAsGuest(request: Request, settings: DownloadSettings): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set("Authorization", "Bearer " + settings.anon);
  try {
    const res = await fetch(request.url, { headers });
    void tell("ok");
    if (res.ok) await (await caches.open(settings.target)).put(bare(request.url), res.clone());
    return res;
  } catch (err) {
    void tell("fail");
    throw err;
  }
}

// A signed in user's own tables (Phase 8). Never stored in the shared cache and
// never answered from it: during a Download the anon swap below would answer
// them empty and keep that, and offline a kept empty answer would hide the
// user's real copy. Offline they come from the per-user store on the device
// (lib/offline/mine.ts), so a failed read here must stay a failed read.
const OWN_TABLES =
  /^\/rest\/v1\/(saved_places|saved_businesses|saved_routes|route_progress|entry_unlocks|completed_routes|profiles)$/;

async function handleOwnRead(request: Request): Promise<Response> {
  const stored = await hasStoredContent();
  try {
    const res = await (stored ? withTimeout(fetch(request), NET_TIMEOUT_MS) : fetch(request));
    void tell("ok");
    return res;
  } catch (err) {
    void tell("fail");
    throw err;
  }
}

async function handleRead(request: Request): Promise<Response> {
  const settings = await downloadSettings();
  if (settings) return storeAsGuest(request, settings);

  const stored = await hasStoredContent();
  try {
    const res = await (stored ? withTimeout(fetch(request), NET_TIMEOUT_MS) : fetch(request));
    void tell("ok");
    return res;
  } catch (err) {
    void tell("fail");
    if (stored) {
      const hit = await caches.match(bare(request.url), { ignoreVary: true });
      if (hit) return hit;
    }
    throw err;
  }
}

// A CORS copy, so the browser counts its real size and not a padded one.
async function keepPhoto(url: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return;
    const cache = await caches.open(PHOTOS);
    await cache.put(bare(url), res);
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - PHOTO_CAP))) await cache.delete(key);
  } catch {
    // A photo that cannot be kept is just not available offline.
  }
}

async function handlePhoto(e: FetchEv): Promise<Response> {
  const { request } = e;
  const settings = await downloadSettings();
  if (settings) {
    const res = await fetch(request);
    // Only CORS responses, which the Download asks for. A plain image tag
    // gets an opaque one, which the browser counts far too large.
    if (res.ok && res.type === "cors") await (await caches.open(settings.target)).put(bare(request.url), res.clone());
    return res;
  }

  const hit = await caches.match(bare(request.url), { ignoreVary: true });
  if (hit) return hit;

  const stored = await hasStoredContent();
  try {
    const res = await (stored ? withTimeout(fetch(request), NET_TIMEOUT_MS) : fetch(request));
    if (stored && res.ok) e.waitUntil(keepPhoto(request.url));
    return res;
  } catch (err) {
    // The full photo is not here. The thumbnail from the Download may be.
    const thumb = await caches.match(bare(request.url + THUMB_SUFFIX), { ignoreVary: true });
    if (thumb) return thumb;
    throw err;
  }
}

async function fromShell(key: string, request: Request): Promise<Response> {
  const hit = await caches.match(key, { cacheName: SHELL });
  return hit ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
  const e = event as FetchEv;
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== origin) {
    // Supabase reads and public photos. Auth and everything else (tiles) go
    // straight to the network, as they do today.
    if (OWN_TABLES.test(url.pathname)) e.respondWith(handleOwnRead(request));
    else if (url.pathname.startsWith("/rest/v1/")) e.respondWith(handleRead(request));
    else if (url.pathname.startsWith("/storage/v1/object/public/")) e.respondWith(handlePhoto(e));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  // Every page address opens the app. A path with a file extension is a real
  // file, so it is left alone.
  if (request.mode === "navigate" && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    e.respondWith(fromShell(INDEX, request));
    return;
  }
  if (shellUrls.has(url.href)) e.respondWith(fromShell(url.href, request));
});
