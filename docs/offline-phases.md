# offline-phases.md

Status: Phases 1 to 5 done. Phase 6 built, not yet run. Later phases not started.

Decisions live in `offline-plan.md`. This file is the order of work.

## How to read this

- Phases run in order. Each one assumes the ones before it.
- Subphases run in order inside a phase.
- Two stops only: Gate A (end of Phase 1) and Gate B (end of Phase 10). Between gates, keep going.
- At the end of each phase, report in three lines: done, skipped, found. No question unless a rule below says stop.

| Phase | What works after it |
| --- | --- |
| 1 | Nothing ships. Spike results decide the design. |
| 2 | New photos get a thumbnail. Old ones are backfilled. |
| 3 | The app opens offline, from the browser and when installed. |
| 4 | Download and sync work in code, no screen yet. |
| 5 | The Offline modal, menu item and notice. A Pasig download works end to end. |
| 6 | Each feature in the offline table behaves as planned. |
| 7 | One trail can be downloaded and read offline. |
| 8 | Save, Start trail and unlocks work offline and sync later. |
| 9 | Docs and Help copy match the screens. |
| 10 | Device tests, review, release to testers. |

## Rules for every phase

- Before editing a file, trace the files connected to it (constraints.md #1). Before adding a function or component, grep for it under other names (#3).
- Do not touch migrations, RLS, `auth-context.tsx`, `auth-types.ts` or `supabase.ts`. If a step seems to need one, stop and flag it.
- Ponytail ladder: reuse, native, installed dependency, then new code. New dependencies: `vite-plugin-pwa` and `sharp` (dev only, for the backfill script).
- UI follows `ux-ui-guidelines.md`: tokens only, Phosphor icons, no emoji, every state, one label "Offline".
- Every message string lives in one file (5.3) and is reused. Help copy must match the screens word for word.
- End of each phase: `npm run typecheck`, `npm run lint`, `npm run build`. Fix before moving on. One commit per phase.

## Phase 1: Inventory and spikes

Throwaway branch. Nothing merges. Results go in a "Spike results" section of `offline-plan.md`.

1.1 Grep for `navigator.onLine`, `serviceWorker`, `workbox` and `idb`. None exist today. A manifest already exists: `public/manifest.json`, linked from `index.html`, icons in `public/icons`. Keep it. Do not generate a second one.

1.2 List every public read per screen: Home, Discover list and map, place detail, business detail, events, fiestas, trails, trail detail, scan, Saved. For each: file, call, GET or RPC, and what makes the URL change (id, map bounds, user). Known so far:
- `search_*`, `recommend_items` and `locations_with_entries` are RPC calls (POST). The Cache API cannot store POST, so these are never cached.
- `placesQuery` and `businessesQuery` in `discover-query.ts` change with map bounds.
- Detail pages read by id inside the page files: `discover-place-detail.tsx`, `discover-business-detail.tsx`, `event-detail.tsx`, `fiesta-detail.tsx`.
- Saved reads use `.in()` ids that differ per user.

1.3 Choose how detail screens work offline. A: Download replays one GET per record. B: detail pages read from the downloaded list. Count requests and bytes at 5,000 records. Starting limit for A: under 20 MB and a few minutes on 4G. Adjust after measuring.

1.4 Add `vite-plugin-pwa` on the branch. Use `injectManifest` with a short `src/sw.ts`, because `generateSW` cannot swap request headers (1.6). Set `manifest: false`. Vite is 5.x, so confirm the plugin version fits.

1.5 Check the shell size. `maplibre-gl` pushes a chunk past Workbox's 2 MB precache default, so raise `maximumFileSizeToCacheInBytes`. Ignore `public/content-photos` (11 MB of seed photos the app does not read). Keep `public/data/pasig-barangays.geojson` (`fiestas.ts` reads it).

1.6 Spike the anonymous swap. On a download message the worker re-sends Supabase GETs with the anon key as `Authorization` and stores the response. Offline, a signed in session must read it. Check the `Vary` header and how `.range()` pages are sent. Pass: Guest, signed in user and staff read the same stored rows. Fail: use the fallback (query functions take an optional client) and list the files it touches.

1.7 Vercel checks. `/sw.js` is served as a file and not rewritten by the catch-all in `vercel.json`. Add the no-cache header for it. Deep links `/trails/<id>` and `/scan/<token>` open offline from the shell. `/api` is not intercepted.

1.8 Photo quota. Fetch 50 Supabase photos with CORS and without it. Read `navigator.storage.estimate()` before and after. Keep CORS if the sizes differ.

1.9 Real iPhone. Record the `navigator.storage.persist()` result. Download in Safari, then install, and check if the data carries over. Repeat inside the installed app. Note anything cleared after a few days.

1.10 Write the results in `offline-plan.md` under "Spike results".

**Gate A.** One confirmation on three results: the 1.3 choice, the 1.6 pass or fail, and the iPhone carry over. If any result breaks the plan, stop here and revise it.

## Phase 2: Photo thumbnails

Before any download code, because download size depends on it.

2.1 Path rule: the thumbnail sits in the same folder as the original, named `<original name>.thumb.webp`. A `thumbs/` folder would fail the storage policies in `0001_baseline.sql`: vendor uploads need the business id in the path and discovery uploads need `discovery/`. The sibling path passes every existing policy, so no migration.

2.2 Grep every `storage.from(` upload and removal. Found four flows into `content-photos` (`use-place-photos.ts`, `vendor-items.ts`, `discovery-photo.ts`, `landing-slides.ts`) and the avatar bucket, which is out of scope. `business_photos` has no upload flow in the app.

2.3 New file `src/lib/photo-thumb.ts`: `thumbPath`, `thumbUrl` and `uploadThumb(bucket, path, file)`. Canvas resize to 400 px wide, WebP. If the browser returns PNG instead, use JPEG.

2.4 Call `uploadThumb` after the original uploads in `vendor-items.ts` (`uploadItemPhoto`), `discovery-photo.ts` and `use-place-photos.ts`. `landing-slides.ts` is skipped: a few hero images, not record covers.

2.5 A failed thumbnail upload keeps the original and does not block the save. The backfill in 2.7 catches it.

2.6 Removal deletes the thumbnail with the original: `getStoragePathFromPublicUrl` in `use-place-photos.ts` and `removeItemPhotoFile` in `vendor-items.ts`, plus the matching ones from 2.2.

2.7 `scripts/make-thumbs.mjs` with `sharp` as a dev dependency, run with `npm run thumbs` (`--dry-run` and `--limit=N` available). Lists the bucket, skips existing thumbnails, resizes, uploads. Safe to re-run. The service key comes from a local env var and is never committed.

2.8 Measure: the backfill prints the photo count and average thumbnail size. Write both in the Photos section of `offline-plan.md`.

## Phase 3: Worker and shell

The app opens offline. No content yet.

3.1 Delete `public/spike/`. Then `vite.config.ts` and `package.json`: plugin settings from Phase 1 (`injectManifest`, `manifest: false`, 5 MiB file limit, `content-photos/**` ignored). `devOptions` off so `npm run dev` runs no worker.

3.2 `src/sw.ts`: precache the shell, navigation fallback to `/index.html`, deny `/api` and every other origin (so Supabase, auth and tiles are untouched), ignore every non-GET. No Workbox runtime import, no `skipWaiting`.

3.3 `src/main.tsx`: register the worker. A new version applies on the next open. No prompt (constraints.md #2).

3.4 `vercel.json`: no-cache header for `/sw.js`.

3.5 Keep `public/manifest.json`. Check install criteria in Chrome devtools.

3.6 Test with `vite preview`. Load once, go offline, open `/`, `/welcome` and a deep link. Confirm voice search still posts to `/api/transcribe`.

3.7 Test an update. Build twice and confirm the second build replaces the first on the next open.

## Phase 4: Offline module

`src/lib/offline/`, no screens. Files: `meta.ts`, `status.ts`, `download.ts`, `sync.ts`, `index.ts`.

4.1 `meta.ts`: last synced time, last attempt time, state, active cache name, downloaded trail ids. In `localStorage`, every read and write in try/catch. Empty storage reads as not downloaded.

4.2 `status.ts`: online state from the `online` and `offline` events, plus a message from the worker when a network fetch fails or succeeds. A `useOnline` hook. Grep for an existing one first.

4.3 Cache naming: `content-<timestamp>`. `meta` holds the active name. `caches.match` in the worker searches every cache, so a new cache is the swap and deleting the old one is the cleanup.

4.4 Worker read rule: Supabase GETs and storage photos go to the network first. On failure, `caches.match` ignoring request headers. Normal browsing writes nothing to the data cache. Only Download writes it. Store each response under a bare URL request so no token lands in the cache. Photos viewed online go to a `photos-runtime` cache only when a download exists, capped at 200 entries (starting number).

4.5 A photo miss falls back to the `.thumb.webp` copy in the cache.

4.6 Worker download mode: on `download-start` the worker applies the Phase 1 result (anon swap, or the fallback). On `download-end` it turns off. The mode lives in a marker cache checked with `caches.has`, not in a variable, because the browser can stop the worker at any time.

4.7 `download.ts`, `downloadAll()`: ask for `navigator.storage.persist()`, run the pull list from 1.2 and 1.3 through the existing fetch functions so the URLs match, then fetch thumbnails with CORS, 6 at a time. Report progress. Cancel with an `AbortController` and delete the partial cache. Map failures to specific reasons: network, storage full (`QuotaExceededError`), browser unsupported (no `caches` or no worker).

4.8 Size estimate for the button: row counts from head requests times measured bytes per row, plus cover count times average thumbnail size. Show it rounded, like "about 40 MB".

4.9 `sync.ts`: runs on open, on `online`, and when the tab becomes visible. Skips when nothing is downloaded or a sync ran in the last 24 hours. Pulls into a new cache and flips `meta` only after it finishes. A failure deletes the new cache and keeps the old data and the old time.

4.10 Eviction check on open: if `meta` says downloaded but no `content-` cache exists, reset `meta` to not downloaded.

4.11 `scripts/offline-check.mjs`, same style as `scripts/help-search-check.mjs`. Pure functions from `meta.ts` and `sync.ts` so it runs in Node. Cases: once a day rule, swap only on success, failure keeps old state, eviction reset.

## Phase 5: Modal, menu and notice

5.1 `src/lib/offline-modal.tsx`: context with `open`, `openOffline`, `closeOffline`, same shape as `settings-modal.tsx`. Mount the provider in `App.tsx` next to `SettingsModalProvider`, and the modal next to `<SettingsModal />`.

5.2 `src/lib/offline/messages.ts`: every string in one place. "Needs a connection.", "Map needs a connection.", both notice texts, the queued count text, the failure reasons.

5.3 `src/components/offline-modal.tsx` on `components/ui/dialog.tsx`. Import `@/lib/offline/status` and `@/lib/offline/meta` directly in the shell and menus, so only this modal loads the download code. Title "Offline". Five states: Not downloaded, Downloading, Downloaded, Offline and not downloaded, Failed. Use the `Button` `loading` prop, `SquareLoader`, `ErrorState`. The size from 4.8 shows on the Download button. Remove download is one tap with no confirm, since it can be downloaded again.

5.4 Menu item "Offline" with `DownloadSimple`. Files: `public-shell.tsx` (`AccountMenu`, guest and signed in branches), `public-sidebar.tsx` (signed in dropdown, guest footer row). Order: signed in, Profile, Settings, Offline, Help & FAQ. Guest, Home Page, Offline, Help & FAQ. Match the order in `navigation-and-access-control.md`.

5.5 Notice in `public-shell.tsx`: `WifiSlash`, a fixed height token in `index.css`, muted tokens only. Text from 5.2. Date through `formatDateTimeNoSeconds`. Shows only while offline. Respect the top safe area. The admin shell does not get it.

5.6 Check light and dark, 360 px width, keyboard focus, and all five states using the devtools offline switch and throttling.

## Phase 6: Feature behavior offline

One subphase per row of the offline table, then the gaps.

6.1 Discover: offline forces List view and shows "Map needs a connection." (`discover.tsx`, `discover-map.tsx`). The list loads with no bounds, so its URL matches the Download.

6.2 Directions and voice search disabled with "Needs a connection.": the consumers of `directions.ts` and `use-voice-search.ts`.

6.3 Search: `global-search.ts` gets an offline branch that filters the downloaded places, businesses, trails, events and fiestas by name. Lowercase, strip accents, no typo tolerance. Results use the same cards.

6.4 Recommendations: `recommendation-row.tsx` hides the row offline.

6.5 Video: `video-embed.tsx` shows the link only, no player.

6.6 Sign in and sign up show "Needs a connection." offline. Forms only. Do not edit `auth-context.tsx`.

6.7 Any screen whose read is not in the cache shows `ErrorState` with "This page was not downloaded. Connect to load it." Never a blank screen or a spinner that does not end.

6.8 A missing image shows the existing placeholder.

6.9 Check every row of the table in desktop Chrome offline. Record pass or fail in `offline-plan.md`.

## Phase 7: Trail download

7.1 Pack list for one trail, from the 1.2 inventory: the reads the trail page and its stop cards make, the place or business detail for each stop (per 1.3), photo rows, `fetchCredentialNamesByRouteId`, and `fetchEntryByToken(token)` for every entry with a QR token. Plus thumbnails of cover, stop and entry photos.

7.2 `downloadTrail(id)` and `removeTrail(id)` in `download.ts`. Cache name `trail-<id>-<timestamp>`. Reuse the progress, cancel and error code from 4.7. `meta` records the trail id.

7.3 Button on `trail-detail.tsx`, `DownloadSimple`, the same five states as the modal. Works for Guests and signed in users.

7.4 The Offline modal lists downloaded trails with size and Remove.

7.5 Sync refreshes each pack. If `fetchTrailDetail` returns null, the trail is gone: drop the pack and show "This trail is no longer available." in the modal. A removed stop cannot be detected otherwise (no soft delete, see Schema in the plan).

7.6 Offline, the trail page reads from the pack. Start trail and unlocks show "Needs a connection." until Phase 8, so this phase ships on its own.

7.7 Check: download a trail, go offline, open the trail, its stops, entries and photos.

## Phase 8: Own data and the write queue

Signed in users only. The shared cache never holds this data.

8.1 Trace every caller of `saved-places.ts`, `saved-businesses.ts`, `saved-routes.ts`, `trail-progress.ts`, `entry-unlocks.ts` and `trail-scan.ts`: trail page, heart buttons, Saved page, scan page. List them.

8.2 Check the keys. All four tables have a unique key on `(user_id, target)`, so a repeated write is safe. Save uses a plain `insert`, so a repeat returns 23505. Replay will treat 23505 as done. `entry_unlocks` and `route_progress` already upsert.

8.3 `src/lib/offline/mine.ts`: native IndexedDB, a small helper. Stores: `saved`, `progress`, `unlocks`, `queue`. Every key starts with the user id. Every call in try/catch. A failure falls back to online only behavior.

8.4 Mirror reads: the five files from 8.1 copy what they read into `mine` while online. Offline they return the copy.

8.5 Offline joins: `fetchSavedPlaces` and the route equivalent use `.in()` ids that differ per user, so offline they join the mirrored ids with the downloaded Discover and trail lists in memory.

8.6 Writes: save, unsave, Start trail, stop unlock and scan unlock update the mirror first, then try the network. A network failure adds a queue op. Rules: save then unsave of the same id collapse to the last one. Progress keeps the highest stop by `sequence_order`. An unlock is an upsert.

8.7 Shell notice shows "[N] changes will sync when you're back online." while the queue has ops. Controls change state at once, with no per-control message.

8.8 QR scan offline in `trail-scan.ts`: find the token in the downloaded entries (7.1), apply the same GPS radius check, queue the unlock.

8.9 Replay at the same moments as sync (open, reconnect, visible). Oldest first. A network error stops the run and keeps the rest. 23505 counts as done. 23503 or 42501 drops the op and adds it to a dropped list that the modal shows once.

8.10 User binding: replay only when the session user id equals the op owner. Another account's ops wait. Read the inactive sign out logic in `auth-context.tsx` and test that an offline session expiry does not wipe the queue. Do not edit that file.

8.11 Sign out: `lib/offline` listens to `supabase.auth.onAuthStateChange`. On `SIGNED_OUT`: one flush try, then clear that user's saved ids and progress. Ops still waiting stay under that user id and replay at the next sign in. Sign out never waits. `sign-out-dialog.tsx` gets one line: "[N] changes will sync next time you sign in." Delete account (`delete-account-dialog.tsx`) clears all of that user's offline data.

8.12 Extend `scripts/offline-check.mjs`: collapse rules, replay outcomes (done, drop, keep), user binding.

## Phase 9: Docs and Help copy

9.1 `help-content.ts`: add "Can I use the app offline?", "Can I download a trail?" and "How do I install the app?" (Android and iOS steps). Labels come from `messages.ts`. If 1.9 showed no carry over on iOS, the answer says install first, then Download.

9.2 `navigation-and-access-control.md`: Offline item in both menus, Guest and signed in.

9.3 `architecture-notes.md`: new module, `vite-plugin-pwa`, IndexedDB store, files by phase. Tech Stack says Vercel and Supabase for now.

9.4 `decision-log.md`: device level setting (departs from #7), Cache API store, no SQLite, anonymous only shared cache, per-user IndexedDB store and queue, per-trail download, Download buttons as an exception to constraints.md #2, thumbnails beside the original, host stays Vercel and Supabase.

9.5 `competitive-positioning.md`: "works offline for previously loaded content" becomes "works offline after download".

9.6 `build-order.md`: add step 15, Offline. `open-questions.md`: remove what is closed.

## Phase 10: Checks and release

10.1 Run `scripts/offline-check.mjs`, `npm run typecheck`, `npm run lint`, `npm run build`.

10.2 Run `ponytail-review` on the full diff. Remove what it flags.

10.3 Desktop: Chrome, Firefox, Safari. With offline emulation: shell, Discover list, details, search, a trail pack, a queued save, replay.

10.4 Low end Android: time offline search on 5,000 records. Time the download on throttled 4G. Read the storage estimate.

10.5 Real iPhone: install first, Download, airplane mode, walk a trail with GPS, reconnect and confirm replay.

10.6 Two accounts on one phone. A queues a change and signs out. B signs in and A's change does not replay. A signs in again and it does.

10.7 Eviction: clear site data in devtools, open the app, confirm the modal is back at Download.

10.8 Record real numbers in `offline-plan.md`: text size, thumbnails, per trail. If a number misses its target, pull the matching row from Left out.

10.9 Vercel preview: the worker is fresh after a deploy, a new version applies on the next open, and Android and iOS installs both work.

10.10 Mark the step done in `build-order.md` and update the Status line in `offline-plan.md`.

**Gate B.** One confirmation to release to testers. Do not print QR codes until a final domain is attached to Vercel.
