# decision-log.md

---
## AI RULES, READ FULLY BEFORE ANY ACTION
---

1. Read all existing entries before suggesting anything already decided.
2. Never re-debate a logged decision. If it needs revisiting → flag it,
   don't silently override it.
3. At every major milestone → add an entry before continuing.
4. Before logging anything, apply this filter — if ALL three are false, skip it:
   - Hard to reverse?
   - Affects other parts of the system?
   - Confusing without an explanation?
5. Before presenting options at a milestone → search current community
   consensus on each direction. Present findings, then wait for human
   decision before logging.
6. If two directions were discussed with the human → both get logged,
   with the reason the chosen path was taken.

---
## DECISION ENTRIES
---

**#:** 2
**Milestone:** Auth screens, image panel gradient exception

**RETIRED** — see entry #18. auth-layout.tsx is deleted; no gradient exception is active anywhere in the app. ux-ui-guidelines.md's ban on gradients on structural surfaces stands.

---

**#:** 3
**Milestone:** Map library

**Decision:** discover-map.tsx uses maplibre-gl exclusively; leaflet, react-leaflet and @types/leaflet were removed.

**Standing rule:** Any future map work uses maplibre-gl. Do not reintroduce leaflet.

---

**#:** 7
**Milestone:** Nullable preference/optional columns on profiles

**Decision:** Per-account preferences and optional fields are nullable columns with no stored default. Null means unset; the app decides what unset resolves to at read time. Established with `theme_preference` and `font_size_preference` (0021), matching `verified_at` (0017) and `end_date_time` (0020).

**Standing rule:** A future per-account preference follows this shape, not a preferences table or a stored default.

---

**#:** 8
**Milestone:** No Switch primitive

**Decision:** `src/components/ui` has no Switch and `@radix-ui/react-switch` is not installed. Every toggle is a native checkbox styled `h-4 w-4 rounded border-input accent-primary` inside a native `<label>`.

**Standing rule:** A new toggle reuses that pattern. If one ever needs true Switch semantics, revisit once for every toggle together.

---

**#:** 9
**Milestone:** Global search architecture

**Decision:** One search bar owned by public-shell.tsx (`GlobalSearchContext`), shown on Home, Trails, Discover, Saved and the Events detail route, not Profile. `global-search.ts` queries each table with one function per table in a `Promise.all`, each scoped by that table's own public-select RLS policy, and shows grouped results in one dropdown. Discover's own search input was removed; its list and map read the shared text through `useGlobalSearchQuery`.

**Standing rule:** A new tab with the bar is added to public-shell.tsx's visibility check. A new searchable type follows the per-table-function-plus-`Promise.all` shape. `admin-global-search.ts` mirrors it over each table's staff-select policy.

---

**#:** 12
**Milestone:** Profile picture, username, first/last name schema (migration 0030)

**Decision:** `profiles` gained four nullable columns: `profile_picture` (a Storage public URL, same shape as `place_photos.photo_url`, bucket `avatars`), `username` (unique through a partial index so unset rows don't collide), `first_name`, `last_name`. `display_name` and `contact_number` stay. No RLS change; `profiles_update_own` covers the writes.

**Standing rule:** `display_name` staying beside `first_name`/`last_name` is deliberate until Account Settings decides how old values migrate. A future upload uses the same bucket-plus-stored-public-URL shape.

---

**#:** 13
**Milestone:** Directions panel (mobile bottom sheet)

**Decision:** Mobile Directions opens `directions-panel.tsx`, a plain fixed div (`bottom-16 z-50 rounded-2xl max-w-md`) above the bottom nav, with no Popover or Sheet primitive. Its state (`route`, `directionsPanelResult`, `selectedMode`, `routeDuration`, `modeLoading`, `modeErrorReason`) lives above the Map/List branches so it survives the toggle (moved again by #16). `fetchWalkingRoute` became `fetchRoute(origin, destination, mode)`, and `RouteGeometry` gained `duration` in seconds from OSRM.

**Standing rule:** A future bottom-sheet panel takes this shape (fixed above the bottom nav, state lifted above the views it must survive, no new Sheet dependency). A future OSRM feature reuses `fetchRoute` and `RouteGeometry.duration`. The mode-in-URL clause is superseded by #15.

---

**#:** 14
**Milestone:** Directions panel, desktop variant

**Decision:** `directions-panel.tsx` takes `variant: "mobile" | "desktop"` (default mobile). Desktop is content-sized, `absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-80`, `rounded-2xl border-input bg-card shadow`, rendered inside discover-map.tsx beside ZoomControl and MapCornerControls so nothing needs to reflow. Both variants share `DirectionsPanelContent`, and `handleRouteFound` and `handleCancelDirections` in discover.tsx serve both. Rejected: a right-docked full-height strip like the search panel, since the content is about 200px and the strip would be over 70% empty, against ux-ui-guidelines.md's 30% rule.

**Standing rule:** A floating map control is content-sized, `absolute` inside DiscoverMap's container, and matches that border and shadow. Check what already sits on an edge before docking to it.

---

**#:** 15
**Milestone:** Routing provider swap, Car/Bike/Walk returning identical routes

**Decision:** `OSRM_BASE_URL` moved from `router.project-osrm.org` to `routing.openstreetmap.de`, and the URL is now `/routed-{mode}/route/v1/driving/`. A stock osrm-routed serves one graph and ignores the profile segment, so #13's `/foot/` and `/bike/` returned car routes. FOSSGIS runs three instances (car, bike, foot) behind `routed-*` prefixes, and `TravelMode`'s values are those suffixes. The hand-set `User-Agent` was removed (a forbidden fetch header, so dead code). FOSSGIS's credit and "fix the map" link went into `discover-map.tsx`'s `customAttribution`.

**Standing rule:** An OSRM feature picks its graph by base URL plus prefix, never by the profile segment. Before trusting a routing `duration`, check it differs across modes. Both providers are limited to 1 req/sec, no SLA, non-commercial; if that is outgrown, self-host with the same prefix shape or pay.

---

**#:** 16
**Milestone:** Directions state and user location moved to public-shell.tsx; one-shot geolocation replaced with a live watch

**Decision:** `userLocation` and the whole Directions session lived in `DiscoverPage`, which unmounts on every tab switch, so leaving Discover cancelled a route and lost the position. Both moved to `public-shell.tsx` as `UserLocationContext` and `DirectionsContext`, provided from `PublicShell()`, with `useDirectionsState`, `useUserLocation` and `useDirections` shaped like `useGlobalSearchQuery`. The logic moved verbatim and no consumer changed. Location also changed from one `getCurrentPosition` read to a `watchPosition` with `enableHighAccuracy: true`, cleared on shell unmount.

**Standing rule:** State that must survive a tab switch is a context provided from `PublicShell()`, with a `use*` hook that errors outside its provider, moved verbatim. A one-shot geolocation read defaults to `watchPosition` unless a snapshot is truly wanted.

---

**#:** 17
**Milestone:** Content population (build-order.md step 11), seed.sql real content

**Decision:** `supabase/seed.sql` replaced every "Demo ..." row with real CATO content from NEW_DATA.md and storage-manifest.md: 5 places, 3 businesses (2 business categories), 3 events (all land as `past`). Routes/Trails and the personal-record tables that referenced sample ids (completed_routes, user_credentials, saved_routes, saved_places) are left empty on purpose, explained in a comment block in seed.sql. Two gaps with no CATO data were filled with sourced web research and flagged in seed.sql as prototype quality: `business_items` names and prices, and coordinates (street or barangay level, not surveyed). Photo URLs use a `:SUPABASE_URL` placeholder; the 30 photo files still need uploading to `content-photos`.

**Standing rule:** A table that cannot be seeded with real data gets researched, cited and flagged as prototype quality, never filled with plausible invented values. A dropped seeded section is explained inside seed.sql, not only in a planning doc.

---

**#:** 18
**Milestone:** Landing page with hero carousel; Login/Signup become a short popup

**Decision:** Two changes. (1) A public landing page at `/welcome` (hero with copy left and a carousel right; stacked on mobile); `/` stays the Home feed for everyone, including Guests, so the landing page is an entry surface, not a gate. (2) Login and Signup become a short centered popup (`auth-modal.tsx`, two modes, no imagery). `/login` and `/signup` stay as routes that open the popup over the page behind them, because email confirmation links, `protected-route.tsx` and bookmarks need a target. The fourteen guest-gate call sites now call `openAuth("login")`; `protected-route.tsx` keeps its redirect. The form logic moved verbatim into `login-form.tsx` and `signup-form.tsx`. Popup state is provided from `App`, not `PublicShell`, since the Landing page and `protected-route.tsx` sit outside the shell; this is the one deviation from #16's mount point.

A fifth `system_permission`, `manage_landing`, was added at all six sites in one pass: the check constraint (0033, 0002 untouched), `auth-types.ts`, `staff-form-dialog.tsx`, `admin-staff.tsx`, `admin-sidebar.tsx` and `App.tsx`'s route guard. Folding it into `manage_places` would give place editors control of the first screen. New table `landing_slides` (0033) has a select policy with no `to` clause gated on `active`, since signed-out visitors render it, and a write policy mirroring `places_write_staff`. The `content-photos` bucket is reused under `landing/`. A new policy `landing_photos_write_staff` (0033) was needed because 0031 only admits admin, `manage_places` and `review_businesses`; storage policies are OR'd, so 0031 was not edited. Hero captions use a solid card-colored bar under the image, not a scrim, so no gradient exception is needed.

**Standing rule:** Pre-auth content uses anon-read plus staff-write RLS. A new carousel reuses `filmstrip.ts`. A new `system_permission` touches all six sites together. State needed inside and outside `PublicShell` is provided from `App`. Auth surfaces stay plain forms with no imagery.

---

**#:** 19
**Milestone:** Activity log (activity-log-plan.md, activity-log-phases.md)

**Decision:** Append only `activity_log` table (0037), admin read only. Triggers capture data actions, one `log_auth_event` RPC captures sign in and sign out, and the create-staff-account function inserts `staff_created` itself. Review tables own `verified` and `rejected`, so places and businesses ignore `verification_status` and an approval logs once. `route_stops` and `place_photos` log inserts and deletes only, so trail stop reordering stays invisible.

**Standing rule:** A new staff writable table gets its `log_activity` trigger in the same migration, and a new sign in path calls `log_auth_event`. Run `supabase/activity_log_check.sql` after changing a log function.

---

**#:** 20
**Milestone:** Rules field (0039, rules-field-plan.md, rules-field-phases.md)

**Decision:** `places` and `businesses` gained a nullable `rules` text column (0039), no default or check, per #7. The 500 character cap lives in the forms only. No RLS or `log_activity` change, and seed.sql stays as is (#17 bars invented content). Place form: first field of step 2 ("Rules and history"). Business form: after Opening Hours, shared by the admin and vendor forms. Public pages: right after the last visit info section (after Facilities on a place, after Contact on a business), before long content, line breaks kept, hidden when empty. Rejected: the hours column or step 1 on the form, and last or right after Hours on the pages; the chosen spots keep step 1 unchanged and visit info together.

**Standing rule:** A new visit info text field takes the same public position. A new optional column takes the #7 shape.

---

**#:** 21
**Milestone:** Location field (location-field-plan.md, location-field-phases.md)

**Decision:** A draggable map pin sets `latitude` and `longitude` on `places` and `businesses` (no schema change). The pin is the source of truth; Address is an editable label filled from it, and a drag never overwrites typed text. Required on all three forms (admin place, admin business, vendor), which repairs old rows on their next edit. Geocoding is Photon's public server through one base URL constant in `geocode.ts`, searched on Enter (not as you type) for fair use, and it only ever sets the pin. Results show every hit and never auto-pick, since 3 of 8 seeded rows landed far from their point. `formatAddress` treats every part as optional (`street` was missing on 3 of 8 points, `housenumber` on 7 of 8; barangay is under `locality`). Address shows as a muted line under the category on both public detail pages, outside #20's position rule. Rejected: autocomplete-first and "both equal"; Pasig addresses use lot, block, sitio and barangay and OSM house numbers are patchy, so an address-led flow often has nothing to suggest.

**Standing rule:** A map picker or geocoder call goes through `geocode.ts` and `location-picker.tsx`. A new provider is one base URL change. Photon's public server is a demo with no uptime promise.

---

**#:** 22
**Milestone:** Resident desktop layout, Home first (page-container.tsx)

**Decision:** A shared `PageContainer` (`components/public/page-container.tsx`) replaces the copy-pasted `max-w-md` wrapper, with `narrow` (`max-w-md`, forms and settings) and `wide` (`md:max-w-5xl`, feeds and grids); below `md` they match. Home and Trails use `wide`, and other pages migrate one at a time. The desktop shell keeps `SidebarInset` at `--sidebar-width-icon` with the expanded rail on top, so `wide` reserves twice the 160px difference, read from the shell's CSS variables. That clearance lives in the container, not the shell, because Discover renders a full bleed map through the same Outlet. Home: the announcement carousel shows 1 or 3 tiles (odd only, or `filmstrip.ts` flips tiles off screen) and goes static with no autoplay or dots when there are no more announcements than tiles; category rows step to 176px cards with scroll buttons at `md+`; verified rows and Trails rows become one line at `md`. `TrailCard` takes an opt-in `inline` prop because `saved-trail-row.tsx` and `completed-trail-row.tsx` need the stacked shape. Rejected: announcements as a right column, since usable width at 1280px is about 900px.

**Standing rule:** A new resident page uses `PageContainer` (`narrow` unless a feed or grid). Never hardcode a page width or pad the shell to clear the rail.

---

**#:** 23
**Milestone:** Icon library swap (Lucide to Phosphor)

**Decision:** `lucide-react` is replaced by `@phosphor-icons/react` across `src/`, on direct instruction. The `icon` column strings (`place_categories`, `trail_categories`, `event_categories`, `business_categories`, `place_facilities`) keep their Lucide-style values, so no migration; only the five `*-icons.ts` maps changed. Phosphor has no parking icon, so SquareParking became `LetterCircleP`. Filled states use `weight="fill"`.

**Standing rule:** Icons come from `@phosphor-icons/react` only; the weight rule is in #25.

---

**#:** 24
**Milestone:** Icon weight, duotone default (amends #23)

**Decision:** Superseded by #25 for weight. Still in force from this pass: `supabase db lint --linked=false` connected to the remote project because the CLI treats a passed `--linked` flag as set whatever its value, so CI now uses `--local`. `supabase/.temp` is in `.gitignore` but tracked in the repo, which is how CI found a linked project.

---

**#:** 25
**Milestone:** Icon weight, bold default (amends #24)

**Decision:** Bold is the default weight for every Phosphor icon, set once through `IconContext.Provider` in `main.tsx`, on direct request. `fill` marks active, saved and completed states; the nav icons fill when active. Icons outside the provider's reach pass `bold` themselves for the resting state: the nav icons in `bottom-nav.tsx`, `public-sidebar.tsx` and `admin-sidebar.tsx`, the unsaved Heart in `save-button.tsx` and `save-route-button.tsx`, and the category icon in `discover-map.tsx`'s `markerElement` (rendered with `renderToStaticMarkup`, outside React).

**Standing rule:** A new icon takes the bold default from `IconContext` with no `weight` prop. An icon rendered through `renderToStaticMarkup`, or with a conditional `fill`, passes its resting `weight` as `bold`. No second icon library.

---

**#:** 27
**Milestone:** Category colors (category-colors-plan.md, category-colors-phases.md)

**Decision:** `place_categories` and `business_categories` (the two map lists) each gained a nullable `color` text column (0041), per #7. It stores a palette key; the palette is ten fixed keys (red, orange, green, teal, blue, indigo, purple, pink, brown, slate) in `src/lib/category-colors.ts`, each with a `--category-<key>` token in `:root` and `.dark` plus one `--category-foreground`. `categoryColor(key)` falls back to blue for null or unknown keys, so no backfill. The Discover marker is a filled circle in the category color; its ring now shows status (verified solid `--card`, pending dashed `--muted-foreground`). Color is applied by inline `style`, since keys are dynamic and markers are built outside React. `createCategoryCrud(table, { color: true })` reads and writes `color` only for the two map lists, and the admin dialog shows a swatch row only when `config.colors` is set. No RLS, `log_activity` or seed change. Rejected: color on all five category tables, a free hex picker (cannot promise contrast), and a light/dark pair per category. Every palette value passes 4.5:1 in both themes. Discover filter chips stay uncolored.

**Standing rule:** A new color is a token in both themes plus one `CATEGORY_COLORS` row, and passes 4.5:1 in both themes. A new map category list gets the `color` column and `colors: true`. Run the migration before the app build goes live, since the app selects `color`.

---

**#:** 28
**Milestone:** Discover map bounds (map-bounds-plan.md)

**Decision:** Discover's map stays near Pasig automatically: no dropdown, setting or column. `discover-map.tsx` sets `maxBounds` to a base box of 120.965, 14.455 to 121.195, 14.685 (Pasig's box plus 0.065 degrees, about 25 by 25 km), sized for tall phones. When the live location or a route corner falls outside the base but inside the limit box (Pasig's box plus 0.15 degrees, 120.88, 14.37 to 121.28, 14.77), `growIfNeeded` calls `setMaxBounds` once with the limit box before the camera moves, and never shrinks for that mount. A point outside the limit is ignored (no growth, no auto center, "You're outside the map area." in the locate error slot). Nothing is stored; a remount re-derives growth from `userLocation` and `route`. The numbers live in `map-style.ts` (`PASIG_BOUNDS`, `BASE_BOUNDS`, `GROW_LIMIT`, `inBounds`, `floorZoom`); `PASIG_BBOX` in `geocode.ts` moved there as `PASIG_BOUNDS` and is imported relatively so `npx tsx src/lib/geocode.ts` resolves it. Rotate and tilt are off on Discover, there is no `minZoom` (the bounds set the floor), and `ZoomControl` disables Zoom out at `floorZoom`. The pin picker maps in the business and admin place forms stay unlocked so vendors near the edge and old odd rows still work. Rejected: an area dropdown (constraints.md's Automation First), inside/outside Pasig detection (needs a polygon and GPS permission, jumps at the border) and a padded union of location and route corners (cropped wide flat routes).

**Standing rule:** Bounds numbers live only in `map-style.ts`. A camera move that could leave the base box calls `growIfNeeded` first. The pin picker stays unlocked. Accepted ceilings: parts of neighboring cities stay reachable, and a route wider than 10.8 km on a 390 px phone is clipped.

---

**#:** 29
**Milestone:** Item search (item-search-plan.md, item-search-phases.md)

**Decision:** Global search gained Items as a fifth source, extending #9. `searchItems` reads `business_items` with the first photo, and the panel shows an "Items" group after Businesses (`ItemRow`: thumbnail, name, price, store, `VerificationBadge`), fetching 4 and showing 3, then a "View all" row to `/discover`. A row opens the store's items tab (`?tab=items`). `searchItems` filters store status itself (verified or pending, see #31), because `business_items_select_own` and `business_items_write_staff` (0004) let owners and staff read an unverified store's items. `searchBusinesses` and Discover's `fetchBusinesses` have the same gap and were left for their own fix. Discover now matches item names too: `DiscoverBusiness.itemPrices` became `items: { name, price }[]`, and `src/lib/item-match.ts` holds `matchingItem` (lowest priced match) and `formatItemPrice`, used by both the filter and the list card. No migration, RLS or seed change. Rejected: a modal over the map, a separate results screen (already rejected in #9), a `brand` column, merging items across stores, a sort control.

**Standing rule:** A new searchable type repeats any status or published filter the public policy alone does not guarantee for signed in users. Add a `pg_trgm` index if the `ilike` scan slows at about 300 vendors.

---

**#:** 31
**Milestone:** Typo tolerant search, phases 1 and 2 (public and admin global search)

**Decision:** Global search (#9, #29) tolerates typos ("adbo" finds Adobo). Migration 0042 enables `pg_trgm` and `fuzzystrmatch` and adds `search_norm()` (lowercase, accent folding, apostrophes dropped, other non-alphanumerics to one space; symbols-only returns nothing), `search_tier()`, `search_fuzzy()`, one trigram GIN index per searched column (places.name, businesses.name, routes.name, events.title, business_items.name, profiles.display_name) and six SECURITY INVOKER functions: `search_places`, `search_businesses`, `search_trails`, `search_events`, `search_items`, `search_staff`. Each returns `setof <table>`, so `global-search.ts` and `admin-global-search.ts` keep their `.select()` embeds and swap in `.rpc(fn, { q, lim }).select()`; RLS still decides visibility. A name matches when it contains the query, or passes the trigram prefilter (word similarity 0.2) and either scores 0.5 or more or every query word is within a few edits of a name word (0 edits for 1-3 letters, 1 for 4, 2 for 5 or more); queries under 3 characters only do contains. Ranking is exact, starts with, a word starts with, contains, then fuzzy, by similarity then name. `search_events` takes `only_published` (true by default; the staff bar passes false), and `search_items` and `search_staff` repeat their verified/pending and `role = 'staff'` rules inside the function so the row cap counts shown rows. `searchItems` must not chain `businesses!inner` or `.in()` onto `.rpc()` (PostgREST answered 400 on the live project and the catch hid it as "No results"); it reads plain columns from the function, then stores and photos with ordinary queries. Items sort by match quality, then name, then price low to high with unpriced last. Rejected: Fuse.js (client lists only, new dependency), hosted search (Algolia, Typesense, Meilisearch: every table synced, status rules duplicated), hand-rolled edit distance, and trigram or edit distance alone (offline check: trigram alone missed 60% of swapped letters; the combined rule found 91-100% across typo types).

Scope: phases 1 and 2 cover the public and admin global search. Not yet changed: Discover's in-memory filter and the admin table filters, so a typo shows fuzzy hits in the dropdown while Discover still filters on exact substring.

**Standing rule:** A new searchable type gets its own `search_*` function built on `search_norm()`, `search_tier()`, `search_fuzzy()` and a trigram index on `search_norm(column)`, called with `.rpc().select()`, repeating any status filter in the function and the client. The index expression must match the function's or Postgres ignores it, and changing `search_norm()` means recreating every index. Accepted limits: no typo tolerance for 1-3 letter words, no synonyms, no description search; thresholds and the 100 character cap are starting values to tune on real data, and the SQL was not run when written, so test it on a real database.

---

**#:** 32
**Milestone:** List your business, desktop stepped form

**Decision:** From md up, the create branch of `vendor-dashboard.tsx` is the same three step form as `admin-business-detail.tsx`: Business, Location (address and a tall map pin), Rules and story, with a "Step N of 3" row, Back/Next, "List my business" on step 3, a "Required to continue" line, and Enter meaning Next on steps 1 and 2. It reuses `BusinessFields`' `section`, `stepHeading` and `className` props through a local `CreateBusinessStepper`, and fits the viewport using `ADMIN_SCROLL_CLASS` from `admin-form-card.tsx`. Below md the single form is unchanged. The edit form, `createBusiness`, the payload, required-field rules and schema are unchanged. It was written without running the app, so check the step order, the card's height chain inside the public shell and Enter handling on a desktop.

**Standing rule:** If the edit form is stepped later, reuse `CreateBusinessStepper`'s shape (or lift it out), not a second copy.

---

**#:** 33
**Milestone:** Voice search in the public search bar

**Decision:** `global-search-bar.tsx` has a mic button: tap to record up to 8 seconds, tap again to stop, and the transcript fills the query like typing (so #31's fuzzy search and Discover's filtering react with no wiring). It is hidden when the browser cannot record (no MediaRecorder or not HTTPS). The admin bar is unchanged. Transcription is Groq's hosted Whisper (`whisper-large-v3`, free plan) through one Vercel function, `api/transcribe.js`, which exists to keep `GROQ_API_KEY` out of the bundle. It checks method, same-site Origin, audio type, a 1 MB cap and a best effort 8 requests a minute per IP, sends a vocabulary prompt (Pasig names, some Taglish) and drops segments Whisper scores as silence. `vercel.json`'s catch-all rewrite now skips `/api/`. Optional env vars: `GROQ_STT_LANGUAGE` (for example `tl`) and `GROQ_STT_MODEL`. Rejected: the browser's SpeechRecognition (absent in Firefox, audio goes to Google, no local names), in-browser Whisper (big download, weak Filipino, new package), Hugging Face inference (free credit too small), Azure Speech and Google Cloud Speech (account setup, no standing free tier).

**Standing rule:** A server side secret goes in a plain `api/*.js` function with a non-`VITE_` Vercel variable. Voice search in the admin bar reuses `useVoiceSearch` and `/api/transcribe`. Accepted limits: Groq's free plan is shared by every user (about 2,000 requests a day when written; recheck), so a busy day shows "Voice search is busy right now" and there is no fallback yet; audio leaves the device; it only works deployed or under `vercel dev`; the function was written without running it, so test English, Tagalog, local names and Safari.

---

**#:** 35
**Milestone:** Announcements, optional time on events

**Decision:** An event always has a date but not always a time, so the form takes them as separate fields and the time is optional. "No time" is stored as local midnight in the existing `date_time` and `end_date_time` columns, with no schema change, and 00:00 reads back as "no time set". Every place that shows these columns goes through `hasTimeOfDay` in `lib/datetime.ts`, so a midnight value shows the date alone. Known limit: an event cannot start at exactly 12:00 AM, so the form's time list starts at 12:15 AM. Rejected: a `has_time` boolean column (exact, but a migration plus a change to every query and type that reads these columns).

**Standing rule:** A new place that shows `date_time` or `end_date_time` uses `hasTimeOfDay` before showing a time. If the midnight limit ever matters, add the flag column in one migration and replace `hasTimeOfDay` at those call sites.

---

**#:** 36
**Milestone:** Reports section, barangay heatmap

**Decision:** Reports is a real admin section: a selector at `/admin/reports` and the first report, a barangay heatmap, at `/admin/reports/heatmap`. It counts Places and Businesses per barangay, verified and pending shown separately, from pin latitude and longitude (rejected Places and unverified Businesses are left out). CATO wants how much content each barangay has, not activity, so no saves, views or trail data. Access is admin or a staff member holding a new sixth `system_permission`, `view_reports` (0043, constraint dropped and re-added, 0033 untouched), added at the same six sites `manage_landing` was. Staff could not read pending Places through RLS, so 0043 adds `report_points()`: security definer, returns only kind, id, latitude, longitude and status, empty for anyone who is not an active admin or `view_reports` holder, rows with no pin included for the "no pin" note. Barangay is computed on read from the pin, never stored (decision #21). Boundaries are one static Pasig GeoJSON from OpenStreetMap (ODbL, credit shown on the page, license note beside the file). Rejected: new select policies on `places` and `businesses` (every column exposed to a counts-only permission), a blurred density map (cannot give a count per barangay, and exaggerates a few pins), a stored barangay column (goes stale when a pin moves), PostGIS (new dependency for a few hundred points), admin only access (CATO wants staff to have it).

**Standing rule:** A staff facing report that needs rows the staff member cannot read through RLS gets its own counts-only definer function, never a wider select policy. A new report is one more entry in the plain array in `admin-reports.tsx`. The boundary file is a derived ODbL dataset: keep the credit on the report page and `pasig-barangays.LICENSE.md` current. Counting runs client side and is fine for hundreds of rows, move it to SQL if the data reaches thousands.

---

**#:** 37
**Milestone:** Fiestas

**Decision:** A fiesta is permanent reference data, not news, so it is its own table (`fiestas`, 0044) instead of an `events` row. Residents ask "Ano yung fiesta sa Buting?" months ahead, and events are a newest-first feed with one date and a manual upcoming/ongoing/past status. A fiesta has a free-text `date_label` ("February 10", "3rd Sunday of November") and a `month` for sorting, so there is no recurrence engine and nothing to re-enter each year. A one-off change for a year goes out as a normal announcement. Barangay tags are `fiesta_barangays` (no rows is city-wide, one a barangay, several multi-barangay), a closed list of the 30 geojson names; a free-text `community` covers places that are not barangays (Napico). Staff manage fiestas in a Fiestas sidebar item under the existing `publish_events` permission (no seventh permission). `published` means CATO confirmed the date and shows the verified seal, so the rows seeded from the 2021 City Hall Library list load as drafts. Staff find a fiesta from the admin Spotlight search too (a Fiestas group, drafts included, same `search_fiestas`, under `fiestas_select_staff`). Reports gets a second report, Fiesta coverage (`/admin/reports/fiestas`, gated on `view_reports`), one row per barangay with published and draft counts and a status (published, draft only, no fiesta), gaps first, plus a note for fiestas with no barangay tag. It is not a copy of the Fiestas page: that page lists fiestas that exist, so a barangay with none has no row there, and this one shows no names or dates. It reads `report_fiesta_coverage()` (0045), a counts-only definer function, because a `view_reports` holder cannot read draft fiestas through RLS (decision #36's rule). It is a separate report, not a count in the heatmap, since the heatmap counts by pin and fiestas are tagged by name. Residents find a fiesta in three ways: global search (`search_fiestas`, 0045, matches name, saint, community and barangay tags), a public page at `/fiestas/:id`, and a Fiesta tab on any place in the new Barangay Hall category, whose barangay is computed from the pin (decision #21, so the hall stores no link). 0045 also adds the Barangay Hall category, makes `report_points()` skip it (every barangay has a hall, so counting halls hides the empty barangays the heatmap is for), and logs fiestas in the activity log. This stores a barangay name, a deliberate departure from #21's "never stored": a fiesta belongs to a barangay by definition, not by where a pin falls. Rejected: fiestas as Places (a barangay is not a place, and halls would count in the heatmap), fiestas as announcements (stale in the feed, not searchable by barangay), a recurrence engine (dates that move yearly need a human anyway), a sixth public tab (bottom nav stays at five).

**Standing rule:** Barangay names live in three places: `fiesta_barangays`' check constraint, `BARANGAYS` in `src/lib/fiestas.ts` and the geojson `name`. Change them together, in a new migration, never by editing 0044. The category name "Barangay Hall" is matched in `BARANGAY_HALL_CATEGORY` and in 0045's `report_points()`; renaming it in Categories breaks both. Every public fiesta query adds `.eq("published", true)`, since the staff select policy has no published check.

**Accepted limits:** Publishing logs as an "updated" row, not "published", and barangay tag edits are not logged on their own. The seed list is a 2021 post copying a 2000 book. A web check fixed San Joaquin's saint, split Kalawaan into its July 29 parish fiesta and the February Itik-Itik Festival, added San Antonio (date inferred, flagged in its source note) and tagged Napico to Manggahan. Santa Cruz's patron and Santolan's date are still unconfirmed (open-questions #2). CATO has to settle these before publishing. It was written without running the app or the full database stack, so check the form's tag saving, the Fiesta tab on a Barangay Hall page and the new search group by hand.

---

**#:** 38
**Milestone:** Fiestas

**Decision:** Fixed-date fiestas get an optional `start_date` and `end_date`, picked in the admin form the way the Announcements form picks them (a DateField for the start, a "runs more than one day" checkbox for the end). They live in `0044_fiestas.sql` itself, because no fiesta migration had been applied yet, so there is no separate day-span migration. The YEAR IS NOT MEANINGFUL and is never shown: a fiesta repeats every year, so the year only carries the month and day. `date_label` stays required and is written by the form from the two dates ("April 17-18", or "April 30 - May 1" across months), so staff enter it once and every reader (list, search, public page) keeps showing `date_label` unchanged. Rule-based fiestas ("3rd Sunday of November") leave both dates empty, pick a month and type the label. `month` stays for sorting and for rule-based fiestas, and a database check forces it to match the start date's month. A second check requires a start date for an end date, an end date after it, and at most 31 days between them, which catches a mistyped year. Lists sort by month, then start date, then name. **No time of day:** a fiesta is a day or a few, its mass and procession times change by year and by event, and the source data has none. Time-specific happenings (a Misa Mayor at 6 PM, a procession) go out as announcements, which already carry a start and end time. Rejected: a month plus start day and end day (the first version of this decision, replaced because it could not cross a month and did not match how announcements pick dates), a time column (invented precision, no data), showing the year (it goes stale).

**Standing rule:** The label wording and the 31-day cap live in `src/lib/fiesta-dates.ts` and in the end-date check in 0044. Change them together, in a new migration once 0044 has been applied, never by editing 0044 after that.

**Accepted limits:** Written without running the app or the database, so 0044 and the form need a hand check after `npm run db:reset`: a two-day span saves and shows "April 17-18", "Use a date rule instead" returns the Date field to typing, an end date before the start date is blocked, and an old copy of `0046_fiestas_day_span.sql` is deleted from `supabase/migrations`. DateField cannot be emptied by typing (a blank is ignored), so the "Use a date rule instead" link is how dates are removed.

---

**#:** 39
**Milestone:** Reports section, downloads

**Decision:** Both reports (Barangay heatmap, Fiesta coverage) get a Download dropdown in the page header with Excel (.xlsx), PDF and Word (.docx). It saves what is on screen, so the Type select on the heatmap and the Show select on Fiesta coverage carry into the file. The files are built in the browser by hand, in `src/lib/report-files.ts`, with no new package: the project has no spreadsheet, PDF or Word library and installs none, and a report is one small table. .xlsx and .docx are zip files of XML (zipped uncompressed, which every reader accepts) and the PDF is plain objects in the built-in Helvetica font, with the header row repeated on each page and a page number in the footer. Each report only fills in a `ReportTable` (title, detail lines, columns, rows, optional total row, notes) and passes it to `ReportDownloadMenu` (`src/components/admin/report-download-menu.tsx`), so a new report gets downloads by returning one more `ReportTable`. "Doc" is a modern .docx, not the old .doc. Rejected: a library such as SheetJS, jsPDF or docx (new dependency for a few dozen rows), CSV only (not what CATO asked for), Word as HTML renamed .doc (Word warns about it), the browser print dialog for PDF (not a download, and the page styling would print too).

**Standing rule:** A new report builds a `ReportTable` and reuses `ReportDownloadMenu`, never its own file code. The PDF is Latin-1 only (letters like n with a tilde are fine, other scripts print as "?"); a report that needs more must move to a library with embedded fonts, which is a new dependency and needs approval.

**Accepted limits:** The three file types were opened here with openpyxl, python-docx, pypdf, pdftotext and LibreOffice, including a 95-row PDF over three pages, but not in Excel, Word or a browser download. Please download each type from each report once and open it. The heatmap file lists counts only, not the map.
