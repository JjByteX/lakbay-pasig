# offline-plan.md

Status: plan only. No code, no migration. App is in alpha.

## Goal

Optional offline use. A user downloads Pasig content. The app says when it is offline and how old the content is. It updates itself when the connection returns.

## Decided

- Host: Vercel and Supabase for now. No move to Hostinger is planned. The worker setup still must not depend on host features, so a later move stays cheap (see If the host changes).
- Optional. Nothing downloads until the user taps Download.
- The app shell is always cached, so the app opens offline. Content is cached only after Download.
- Control: an "Offline" item in the account menu, for Guests and signed in users. It opens a small centered modal.
- Not in Settings. Settings opens for signed in users only, and Guests are the likely offline users (tourists at a site).
- One label, "Offline", for the menu item and the modal title. No subtitle.
- Icons, Phosphor, left of the label: `DownloadSimple` for the menu item and the Download button (same icon `admin-fiestas.tsx` uses for download), `WifiSlash` for the notice.
- The notice lives in the layout shell, not in a page. It shows only while offline, has a fixed height token, and uses muted tokens only.
- Notice text, offline with a download: "Offline. Showing content saved [date, time]. Some listings may be outdated."
- Notice text, offline with no download: "Offline. Connect to load content."
- Queued changes: the notice adds "[N] changes will sync when you're back online." There is no toast component, and one place beats a message per control.
- Store for shared content: the browser Cache API, through a service worker (`vite-plugin-pwa`). No custom database. No SQLite: the data is small and Postgres stays the source of truth.
- Store for a signed in user's own data: IndexedDB (native, no library), only for saved ids, trail progress, unlocks and the write queue. See Trail downloads and offline saves.
- Download holds public text content (places, businesses, items, events, fiestas, trails, stops, entries, categories, facilities) and one cover photo each. Other photos are cached when viewed online.
- Sync runs in the foreground: on open, on reconnect, on tab focus, at most once a day. It pulls everything, including downloaded trails, then swaps. A failed sync keeps the old data and the old time. Queued writes replay at the same moments. Background Sync is not used (Safari and iOS lack it).
- Trails download one at a time from the trail page, in addition to the full Pasig download. Save, Start trail and stop unlocks work offline for signed in users and sync later.
- Offline detection: `online` and `offline` events, and a failed request counts as offline too.
- Ask the browser for persistent storage at download. If the browser clears the data, the modal returns to the Download state.
- Install is manual. iOS has no install prompt, so there is no install button in v1. Help & FAQ explains the steps for Android and iOS. Offline also works in a browser tab, but an installed app keeps the download more safely.
- iOS users install first, then tap Download inside the installed app, in case Safari and the installed app do not share storage (see Check before building).
- No Wi-Fi only setting. Safari does not expose connection type (verify). The size shows on the Download button instead.
- No Update now button. Sync is automatic (constraints.md #2).
- Last synced time and the list of downloaded trails are the only stored settings. They sit on the device, not in `profiles`. This departs from decision #7 because Guests have no profile. Approved.

## What stops working offline

Each one shows a specific message. None fails silently.

| Feature | Offline behavior |
| --- | --- |
| Discover map | Opens List view. Message: "Map needs a connection." |
| Directions, voice search | Disabled. Message: "Needs a connection." |
| Search | Filters the downloaded list by name. No typo tolerance. |
| Recommendations | Row hidden. |
| Save, Start trail, stop unlock, QR scan unlock | Work for signed in users and are queued. The notice shows the count. Guests: as online, these need an account. |
| Video | Shows the link, no player (discovery-content-plan.md). |

## Modal states

| State | Shows |
| --- | --- |
| Not downloaded | Download button with size. |
| Downloading | `SquareLoader`, progress, Cancel. |
| Downloaded | Last synced date and time, Remove download. |
| Offline, not downloaded | Download disabled. Message: "Needs a connection." |
| Failed | Specific reason (network, storage full, browser unsupported) and a Retry. |

The modal also lists downloaded trails, each with its size and Remove. The trail page button uses the same five states: Download with size, Downloading with progress and Cancel, Downloaded with Remove, Download disabled offline ("Needs a connection."), and Failed with Retry.

## Flow

1. Account menu, Offline.
2. Tap Download.
3. Progress, then Downloaded with the sync time.
4. Offline later: the notice appears and content loads from the device.
5. Back online: it syncs by itself and the notice goes away.

Trail flow: open a trail, tap Download on the trail page, wait for Downloaded. At the site, offline, walk the trail. Stops unlock by GPS and QR scans check the downloaded entries. Progress is kept on the device and replays when the connection returns.

## Never cached

- Signed in user data in the shared cache: `saved_*`, `route_progress`, `entry_unlocks`, credentials, profile. A user's own saved ids, progress and unlocks live only in the per-user IndexedDB store, keyed by user id and cleared on sign out. Credentials and profile are never stored.
- Anything under `/api`.
- Staff and admin reads.

Who writes the cache: only the anonymous view, see Decided in review 1.

## Reuse

- `components/ui/dialog.tsx`, `Button` `loading` prop (decision #53), `SquareLoader`, `ErrorState`.
- `formatDateTimeNoSeconds` in `lib/datetime.ts` for the sync time.
- `fetchCoverPhotoUrls` in `lib/home-query.ts` for cover photos.
- The context shape of `lib/settings-modal.tsx`, so both account menus open the same modal.
- `readAllPages` in `lib/discover-query.ts` already pages past the 1,000 row cap.

New: one `lib/offline` module (download, sync, last synced, trail packs, per-user store and write queue), an online hook, the shell notice, the modal, the trail page button, the service worker config, and `vite-plugin-pwa`.

## Files touched

- `vite.config.ts`, `package.json`
- `src/main.tsx` (register the worker)
- `public-shell.tsx` (notice, mobile `AccountMenu` item)
- `public-sidebar.tsx` (signed in dropdown item, guest footer row)
- New modal component and `lib/offline`
- `App.tsx` (provider and modal), `index.css` (notice height token), new `offline-modal.tsx`, `offline-dialog.tsx`, `offline-notice.tsx`, `lib/offline-modal.tsx`
- Offline behavior (Phase 6): `discover.tsx`, `global-search.ts`, `global-search-bar.tsx`, `result-card.tsx`, `page-directions-button.tsx`, `recommendation-row.tsx`, `video-embed.tsx`, `error-state.tsx`, `login-form.tsx`, `signup-form.tsx`, `google-button.tsx`, new `lib/offline/search.ts`
- `trail-detail.tsx` (Download this trail button)
- `saved-places.ts`, `saved-businesses.ts`, `saved-routes.ts`, `trail-progress.ts`, `entry-unlocks.ts`, `trail-scan.ts` (read and write through the per-user store and queue)
- Upload code for thumbnails: `vendor-items.ts`, `discovery-photo.ts`, `use-place-photos.ts`, new `photo-thumb.ts`, new `scripts/make-thumbs.mjs`
- `vercel.json` (no-cache header for the worker file)

Not touched: `supabase.ts`, `auth-context.tsx`, `auth-types.ts`, migrations, RLS.

## If the host changes

Decided: stay on Vercel and Supabase for now. If a move to Hostinger comes back, redo these:

- Serve the worker file with a no-cache header.
- Send every deep link (`/trails/...`, `/scan/:token`) to the app. `vercel.json` does this now.
- HTTPS. Service workers need it.
- `api/transcribe.js` is a Vercel function. Voice search needs it ported or dropped. Offline already disables voice search.
- Unknown: how Hostinger Node.js hosting serves the built files. Check before any move.

The address matters more than the host. Today the origin is the `*.vercel.app` address. A different address is a new origin, so downloads, installed apps and logins at the old address do not carry over. QR codes embed the address (`VITE_SITE_URL`, or the page address when unset). Until a final domain is attached to Vercel, do not print QR codes, and expect testers to reinstall once when it is. Attaching a domain to Vercel is not a host move and keeps the origin through any later move.

## Photos

Seed photos in the repo average 369 KB (largest 2.7 MB), and uploads accept up to 5 MB with no resizing. 1,000 covers at the seed average is about 370 MB, so photo count per record is not the problem. Photo size is.

Plan:

- On upload, also save a small thumbnail (about 400 px wide, WebP) in the same folder as the original, named `<original name>.thumb.webp`. A separate `thumbs/` folder would fail the storage policies: vendor uploads need the business id in the path and discovery uploads need `discovery/`. No schema or policy change: the thumbnail path is derived from `photo_url`.
- A one-time script makes thumbnails for photos that already exist.
- Download caches thumbnails only. Target 30 to 50 KB each (measure). Full photos are cached when viewed online.
- Upload code touched: `vendor-items.ts`, `discovery-photo.ts`, `use-place-photos.ts`, plus new `photo-thumb.ts`. Landing slide images are skipped: they are a few hero images, not record covers, and they are cached when viewed. `business_photos` has no upload flow in the app, so the backfill script covers those.
- Backfill: `npm run thumbs` (needs `npm install` for `sharp`). It prints the average thumbnail size, the number the download estimate needs.
- Alternative: Supabase image transformation (resize by URL, no upload change). Needs a paid Supabase plan (verify). Not for now.

## Trail downloads and offline saves

Decided. A walk unlocks stops by GPS, and GPS works with no signal, so a tourist at a site can walk a downloaded trail if progress is kept on the device. Saves, trail progress and entry unlocks are owner-only rows in Supabase, and each write is small and safe to repeat: a save is one insert or delete, `route_progress` is one row per user and trail that is overwritten with the highest stop, an unlock is one insert. Last write wins, so a queue replays cleanly.

- **Download this trail.** A button on the trail page (same `DownloadSimple` icon). It stores that trail's stops, their places and businesses, and entries as text, plus thumbnails of the entry photos and stop photos. Target a few MB per trail (measure). Small enough for mobile data, so no Wi-Fi only setting is needed.
- **Optional.** The full Pasig download in the Offline modal stays for browsing and search. The modal also lists downloaded trails with Remove. Still one label, "Offline".
- **Queued writes, signed in users only.** Save, unsave, Start trail, stop unlock and QR scan unlock work offline and show "Will sync when you're back online". The QR scan checks the code against the downloaded entries, then uses the same GPS radius check as today.
- **Own data in a per-user local store (IndexedDB), never in the shared cache.** Keyed by user id. It holds that user's saved ids, trail progress and unlocks, plus the write queue. On sign out the saved ids and progress clear after one try to flush the queue. Changes still waiting stay in the queue under that user id and replay at the next sign in. The existing sign out dialog says how many. A queued write replays only under the same user. A failed replay is dropped and the user is told.
- **Guests** can read a downloaded trail, as online. Save and progress still need an account.
- Entries and QR tokens are already readable by anyone (`discovery_content_select_public`), so a trail download exposes nothing new.

No schema, auth or RLS change. The store clears on sign out by listening to `supabase.auth` from `lib/offline`, so `auth-context.tsx` stays untouched.

## Spike results

Phase 1 status: code side done. Browser tests wait for you: open `/spike/offline-spike.html`, run the tests, press Copy results and paste them back. For 1.6 to 1.8 use the dev server or the Vercel preview. For 1.9 use the Vercel preview on a real iPhone (service workers need HTTPS). Delete `public/spike/` before Phase 3.

**1.1 Existing setup.** `src`, `package.json` and `vite.config.ts` have no `navigator.onLine`, `serviceWorker`, `workbox` or `idb`. `public/manifest.json` is linked from `index.html`. Keep it.

**1.2 Public reads.**

| Screen | Reads | Method | URL changes by |
| --- | --- | --- | --- |
| Home | `fetchAnnouncements` (events), `fetchHomeShowcase` (places, businesses, cover photos) | GET | Fixed. Cover photo URL holds every id. |
| Welcome | `fetchActiveSlides` | GET | Fixed |
| Discover list | `fetchDiscoverResults()` (places, businesses with items, cover photos) | GET | Fixed with no bounds |
| Discover map, itinerary | Same reads with `bounds`, paged with `offset` and `limit` | GET | Map box. Not offline. |
| Place detail | `places` by id, `place_photos` by place | 2 GET | Id |
| Business detail | `businesses` by id, `business_items` with photos, `business_photos` | 3 GET | Id |
| Events | `fetchAnnouncements`, then `events` by id | GET | Id |
| Fiestas | `fetchPublishedFiesta(id)`, place name by id, `fetchPublishedFiestasForBarangay` (2 GET), `/data/pasig-barangays.geojson` | GET | Id, barangay |
| Trails list | `fetchPublishedTrails` (routes, credentials `.in`) | GET | Fixed |
| Trail detail | `fetchTrailDetail(id)`: route, stops, then places `.in`, businesses `.in`, entries by route, entries by place, credential | 7 GET | Trail id |
| Scan | `fetchEntryByToken`, `route_stops` by place | GET | Token, place |
| Saved | `saved_*` rows plus `.in(ids)` reads of places, businesses, routes | GET | User (Phase 8) |
| Search | `search_places`, `search_businesses`, `search_trails`, `search_events`, `search_fiestas`, `search_items` | RPC (POST) | Not cached |
| Recommendations | `recommend_items`, then `.in` reads | RPC (POST) | Not cached, row hidden |
| Your trails | `locations_with_entries` and `routes` reads | RPC and GET | Signed in only, not offline |

`fetchTrailDetail(id)` is deterministic per trail, so Download calling the same function stores exactly the URLs the trail page asks for.

Existing limits found, not fixed here:
- The unbounded Discover read is one request, so the project's max rows cap (1,000 by default on hosted) cuts it. Offline shows the same rows as online.
- `fetchCoverPhotoUrls` puts every id in the URL, about 37 bytes each. Around 200 ids the URL passes 8 KB. Check the gateway limit once CATO's data is in. It affects online use too.

**1.3 Detail screens: choose A.** Download replays one GET per record. Requests per record: place 2, business 3, event 1, fiesta 1 to 2. At 5,000 mixed records that is about 12,000 to 15,000 GETs and 15 to 20 MB at about 3 KB a row. Estimates only, there is no CATO data yet. B is worse here: the list reads carry summary fields, so B needs new full-field reads and page changes, and one request still stops at the row cap. Revisit if places plus businesses pass about 2,000 after CATO's migration.

**1.4 Plugin.** Not installed (no npm this phase). Use `injectManifest`, since `generateSW` cannot swap request headers. Pin `vite-plugin-pwa` to a version whose peer range includes Vite 5 (the repo has 5.4.x) and check it at install in Phase 3.

**1.5 Shell size.** Not measured (no build this phase). In Phase 3 set `maximumFileSizeToCacheInBytes` to 5 MiB, read the build output once, and add `globIgnores` for `content-photos/**`. That folder holds 30 seed photos (about 11 MB) the app does not read. Keep `data/pasig-barangays.geojson` in the precache (`fiestas.ts` fetches it).

**1.6 to 1.9 design findings, applied to Phase 4:**
- Store each response under a bare URL request. Keying by the original request would write the user's token into the cache.
- Worker variables reset when the browser stops the worker. Keep the download mode in a marker cache and check it with `caches.has`.
- CORS responses hide the `Vary` header, so match with `ignoreVary: true`. The spike page confirms it matches.

**1.7 Vercel.** `vercel.json` rewrites everything except `/api/` to the app. Static files should win over rewrites on Vercel. The page checks this on the real deploy. The no-cache header for `/sw.js` is added in Phase 3.4.

**Phase 3 note.** The worker is `src/sw.ts` with no Workbox runtime import, so no `workbox-*` dependency beyond `vite-plugin-pwa`. Navigations are served from the cache first, so a new version applies on the next open.

**Phase 4 note.** Detail pages read their record inline, so `src/lib/offline/reads.ts` repeats those reads (select strings and chain) instead of editing the pages. `scripts/offline-check.mjs` fails if a page drifts from them. Everything in Phase 4 assumes the 1.6 swap test passes. If it fails, only the worker's `storeAsGuest` and `reads.ts` change. Size numbers in `rules.ts` are starting values until the backfill and device tests give real ones.

**Phase 6 note.** Offline search is `src/lib/offline/search.ts`: it filters the downloaded lists (places, businesses and their items, trails, events, fiestas) by name, accent-insensitive. Item hits have no stored id, so their key is `<business id>:<index>`. Every `ErrorState` shows "This page was not downloaded. Connect to load it." while offline, so one edit covers every screen that uses it. Screens with their own inline error text keep it. There is no shared image fallback in the app today (only the hero carousel handles a failed image), so a photo that is not stored shows the browser's broken image. A small shared photo component is the fix if testers hit it.

**Pending your run:** 1.6 pass or fail, 1.7 on Vercel, 1.8 quota ratio, 1.9 iPhone persist and carry over.

## Check before building

- Photos come from Supabase storage, a different origin. Cached cross-origin images can count far more than their size toward the quota, mostly when the response is opaque. Fetch them with CORS so the real size counts, and test with 50 photos.
- Measure the real size of text plus cover photos after CATO's migration.
- Benchmark offline search on a low end Android phone with 5,000 records.
- Test on a real iPhone: persistent storage and eviction, in the browser and installed.
- Queued writes: airplane mode, save, walk a stop, scan a QR code, reconnect and confirm replay. Sign out with changes waiting. Two accounts on one phone. A session that expires while offline, then replay after sign in again.
- On the same iPhone, download in Safari, then install, then check if the data carries over. Old WebKit reports (iOS 11 and 12) say it does not. Current behavior is unconfirmed. If it does not carry over, the Help answer says install first, then Download.
- Confirm the worker file is served fresh and the catch-all rewrite does not break it on Vercel (and again on any new host).

## Left out

| Item | Add when |
| --- | --- |
| Map tiles | OpenFreeMap terms and tile size are checked. |
| Download by barangay or category | Thumbnails are in and the download is still too big. `places` and `businesses` have no barangay column, so split by working out the barangay from latitude and longitude with `public/data/pasig-barangays.geojson`, or by `category_id`. |
| Incremental sync | A full pull is measured too slow. |
| Offline admin panel | Staff ask for it. |
| Install button (Android only) | Testers do not find the install themselves. |
| Store app (wrapper) | A real gap shows up. project-brief.md rules it out for v1. |

## Schema

No change now. For later, needs approval:

- `updated_at` is missing on `business_items`, `route_stops`, `discovery_content`, and the photo tables.
- No trigger in `0001_baseline.sql` updates `updated_at` on edit (checked by search, confirm in the live database).
- No soft delete, so a device cannot learn that a listing was removed.

The "recently updated" marker in competitive-positioning.md needs the same fix.

## Decided in review

1. **Who writes the cache: option A.** Only the public, anonymous view is cached, and Download takes what a Guest sees. This is the usual rule for shared caches: public content is shared, anything personal is never put in it. Offline, everyone sees the same snapshot, including signed in staff. Spike to run first, two ways to do it:
   - The worker swaps the Authorization header for the anon key during Download. No query file changes. Preferred.
   - Query functions take an optional client. Touches the query files.
2. **Photos:** thumbnails at upload, see Photos. Photos per record in CATO's migration no longer decides the download size.
3. **Host and domain:** Vercel and Supabase for now. See If the host changes.
4. **Offline Save, Start trail and trail progress:** queued, plus per-trail download. See Trail downloads and offline saves.
5. **Device level settings:** last synced time and the list of downloaded trails stay on the device, not in `profiles`. This departs from decision #7 and is approved. It is the usual pattern for downloads: Google Maps offline areas and Spotify downloads are per device too.
6. **Download buttons stay manual:** an approved exception to constraints.md #2 (automation first). Enterprise apps keep a download as an explicit user action because it spends storage and mobile data (Google Maps offline areas, Google Drive "Available offline", Spotify). What they automate is keeping a download fresh, and that is automatic here: sync on open, reconnect and focus, and queue replay.

## Docs to update when built

- `competitive-positioning.md`: "works offline for previously loaded content" becomes "works offline after download".
- `navigation-and-access-control.md`: Offline item in both menus, Guest and signed in.
- `architecture-notes.md`: new module, dependency, IndexedDB per-user store, and files. Its Tech Stack says Hostinger. Change it to Vercel and Supabase for now.
- `decision-log.md`: device level setting (departs from #7), Download buttons as an approved exception to constraints.md #2, Cache API store, no SQLite, anonymous-only shared cache, per-user IndexedDB store and write queue, per-trail download, host stays Vercel and Supabase, thumbnails at upload.
- `help-content.ts`: add "Can I use the app offline?", "Can I download a trail?" and "How do I install the app?" (Android and iOS steps). Typed labels in the answers must match the screens.
- `build-order.md` and `open-questions.md`.

## Fit check

- project-brief.md: stays a PWA. Offline serves use at a site, where signal is weak.
- constraints.md: sync and queue replay are automatic. The Download buttons are manual by an approved exception (Decided in review 6). Nothing here touches schema, auth or RLS.
- ux-ui-guidelines.md: modal because it fits one viewport. One label. Icons from Phosphor, no emoji. Tokens only. All states listed. The notice is in the shell.
- ponytail: no database. Cache API for shared content, native IndexedDB only for the per-user queue. One new dependency.
