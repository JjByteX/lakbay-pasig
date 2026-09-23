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

**RETIRED** — see entry #18. auth-layout.tsx is deleted; no gradient exception is active anywhere in the app.

**Decision:** ux-ui-guidelines.md bans gradients on structural surfaces. auth-layout.tsx's image panel is the one exception: a bottom-anchored navy-to-transparent scrim behind the tagline text only, added on direct instruction after a flat overlay and a text-shadow alone both failed to keep the tagline legible against the photo.

**Standing rule:** This is the only gradient allowed anywhere in the app. Any new gradient request elsewhere must be flagged, not treated as precedent.

---

**#:** 3
**Milestone:** Map library

**Decision:** discover-map.tsx uses maplibre-gl exclusively. leaflet, react-leaflet, and @types/leaflet were removed from package.json.

**Standing rule:** Any future map work uses maplibre-gl. Do not reintroduce leaflet.

---

**#:** 7
**Milestone:** Nullable preference/optional columns on profiles

**Decision:** Per-account preferences or optional fields added to `profiles` (or any table) as nullable columns with no stored default. Null means unset; the app decides what an unset value resolves to at read time, not at write time. Established with `theme_preference`/`font_size_preference` (migration 0021), matching `verified_at` (0017) and `end_date_time` (0020).

**Standing rule:** Any future per-account preference follows this same nullable-column shape rather than a separate preferences table or a stored default value.

---

**#:** 8
**Milestone:** No Switch primitive

**Decision:** `src/components/ui` has no Switch component and `@radix-ui/react-switch` is not installed. Every toggle in the app (admin-event-detail.tsx's end-date toggle, settings.tsx's dark mode row) uses a native checkbox styled as a toggle (`h-4 w-4 rounded border-input accent-primary`, wrapped in a native `<label>`), sized `text-sm` on admin surfaces and `text-base` on public surfaces.

**Standing rule:** Any new toggle reuses this same styled-checkbox pattern. Do not add `@radix-ui/react-switch` for a single control. If a toggle ever needs true Switch semantics (a11y role, drag gesture), revisit once, covering every existing toggle at the same time, not one at a time.

---

**#:** 9
**Milestone:** Global search architecture

**Decision:** One global search bar, owned by public-shell.tsx (GlobalSearchContext), visible on Home, Trails, Discover, Saved, and the Events detail route, not Profile. It queries Places, Businesses, Trails, and Events in parallel (global-search.ts, one function per table, `Promise.all`), each scoped to that table's own public-select RLS policy, grouped results shown in one dropdown. Discover's own former search input was removed; Discover's list/map filtering reads the same shared query text via `useGlobalSearchQuery`.

**Standing rule:** Any future tab needing the search bar is added to public-shell.tsx's visibility check, not a new page-level slot. Any future searchable content type follows global-search.ts's per-table-function-plus-`Promise.all` shape. The admin equivalent (admin-global-search.ts) mirrors this shape but reads each table's staff-select policy instead, so results are permission-scoped automatically.

---

**#:** 12
**Milestone:** Profile picture, username, first/last name schema (migration 0030)

**Decision:** `profiles` gained four nullable columns: `profile_picture` (text, a Supabase Storage public URL, same shape as `place_photos.photo_url`, bucket `avatars` not yet created), `username` (text, unique via a partial index so multiple unset rows don't collide), `first_name`, `last_name` (text). `display_name` (0002) and `contact_number` (0002) are kept as-is, not dropped or renamed. `auth-types.ts`'s `Profile` interface and `auth-context.tsx`'s `fetchProfile` select both include all four columns. No RLS change: `profiles_update_own` already covers self-service writes to all four.

**Standing rule:** `display_name` staying live alongside `first_name`/`last_name` is deliberate, not an oversight, until the Account Settings UI decides how existing values migrate. Any future file upload (avatar or otherwise) follows the same bucket-plus-stored-public-URL shape as `place_photos`/this column, not a new variant.

---

**#:** 13
**Milestone:** Directions panel (mobile bottom sheet)

**Decision:** Mobile Directions now opens a fixed panel above the bottom nav (`directions-panel.tsx`) instead of just drawing a route and closing, per `directions-panel-plan.md`. Shape: `fixed inset-x-0 bottom-16 z-50`, `bottom-16` sitting directly above `bottom-nav.tsx`'s own `h-16`, `z-50` above the nav's `z-40`, `rounded-2xl` (16px, the "larger prominent panel" radius), `max-w-md` centered to match every other mobile Discover surface. Plain fixed-position div, matching `global-search-bar.tsx`'s existing dropdown pattern -- no Popover/Sheet primitive added (decision-log.md's own no-Popover state, architecture-notes.md's Current State Notes). All panel state (`route`, `directionsPanelResult`, `selectedMode`, `routeDuration`, `modeLoading`, `modeErrorReason`) is lifted to `discover.tsx` and the panel renders as a sibling to the Map/List branch, not inside either one, so it survives the Map/List toggle and a Directions tap from either surface opens the same panel. `directions.ts`'s `fetchWalkingRoute` was widened to `fetchRoute(origin, destination, mode: TravelMode)`, `mode` passed straight into OSRM's URL profile segment, `RouteGeometry` gained a `duration` field (seconds, read straight from OSRM's own response) to back the panel's estimated-time row.

**Standing rule:** Any future mobile bottom-sheet-style panel (fixed above the bottom nav, sibling to page content, surviving a same-page view toggle) follows this same shape: `bottom-16`/`z-50`/`rounded-2xl`/`max-w-md`, state lifted to the page rather than owned by either branch it needs to survive, plain fixed-position div rather than a new Sheet/Popover dependency. Any future OSRM-backed feature reuses `fetchRoute`'s mode argument and `RouteGeometry.duration` rather than a second fetch function or a second duration field.

---

**#:** 14
**Milestone:** Directions panel, desktop variant

**Decision:** Desktop Directions now opens directions-panel.tsx too (previously: draw the route, close the result popup, nothing else), per `desktop-directions-panel-phases.md`. Rejected shape: a right-docked, full-height strip mirroring public-shell.tsx's own search panel (`fixed inset-y-0 right-0 w-80`) -- a full-height strip for the panel's actual content (~200px: mode row, two text rows, one status row) would leave 70%+ of the panel empty, directly against ux-ui-guidelines.md's "more than 30% empty is too large" sizing rule. Shipped shape instead: `directions-panel.tsx` gained a `variant?: "mobile" | "desktop"` prop (default `"mobile"`, so every existing call site is unaffected); the desktop branch is `absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-80`, content-sized (no fixed height), `rounded-2xl border-input bg-card shadow` matching ZoomControl/MapCornerControls' own floating-map-chrome convention exactly rather than mobile's `border-border`/`shadow-md` pairing. It renders inside discover-map.tsx itself (not as a discover.tsx-level sibling like mobile's `fixed` panel), since it needs to be `absolute` within that file's own relatively-positioned container -- the same coordinate space ZoomControl and MapCornerControls already use. Bottom-centered, same row as ZoomControl (`bottom-6`): centered placement means it never overlaps ZoomControl (bottom-right) or MapCornerControls (top-right), so neither existing control needs to shift when the panel opens -- no reflow logic anywhere. It also never competes with the search panel's own left-edge slot (public-shell.tsx), so the two coexist freely rather than needing to be mutually exclusive. The mode row/From-To rows/time-loading-error row are identical between both variants -- factored into a shared `DirectionsPanelContent` component so only the outer wrapper (positioning + card chrome) differs, not a second copy of the whole card body. `discover.tsx`'s `handleRouteFound` was widened from `if (isMobile) { ...open the panel... }` to always run (the panel *state* is desktop-agnostic; the render call site is what decides mobile-panel vs. desktop-panel vs. neither), and its Cancel closure was extracted into `handleCancelDirections` so both render sites call the identical close logic instead of two copies that could drift.

**Standing rule:** Any future floating map-chrome control (a panel, not a viewport-edge-docked shell surface) follows this same shape: content-sized, not viewport-height; positioned `absolute` inside DiscoverMap's own container, not `fixed` to the viewport; matches ZoomControl/MapCornerControls' `rounded-2xl border-input bg-card shadow` convention. Before docking any new floating map panel to an edge, check what's already anchored there (ZoomControl and MapCornerControls both sit on the right) and prefer a position with no existing occupant over one that would need reflow logic to avoid a collision.

---

**#:** 15
**Milestone:** Routing provider swap, Car/Bike/Walk returning identical routes

**Decision:** `directions.ts`'s `OSRM_BASE_URL` moved from `router.project-osrm.org` to `routing.openstreetmap.de`, and the URL shape changed from `/route/v1/{mode}/` to `/routed-{mode}/route/v1/driving/`. Reason: entry #13 logged "`mode` passed straight into OSRM's URL profile segment" on the assumption that segment selects a routing profile. It does not. A stock `osrm-routed` process serves the single graph it was prepared with and ignores the profile segment, without validating it -- so `/foot/` and `/bike/` were accepted and answered with car data. The panel's three mode buttons were wired correctly end to end (`handleSelectMode` refetches, `fetchRoute` passes the mode through); the server was the only thing not honouring them. FOSSGIS runs three separate instances, one graph each (car, bike, foot worldwide), selected by a `routed-*` path prefix instead. `TravelMode`'s existing values (`"foot" | "bike" | "car"`) are those three suffixes verbatim, so `routed-${mode}` is the entire mapping -- no lookup table, no type change, and neither caller (`result-card.tsx`'s first Directions tap, `discover.tsx`'s `handleSelectMode`) needed editing. The hand-set `User-Agent` header was deleted at the same time: `User-Agent` is a forbidden header name in the Fetch spec, so the browser stripped it and sent its own; the constant was dead code claiming a guarantee it never provided. FOSSGIS's usage policy requires a credit plus a "fix the map" link, both added as further clauses in `discover-map.tsx`'s existing `customAttribution` string rather than a second attribution control, matching Phase 3.8's own precedent.

**Standing rule:** This supersedes entry #13's "`mode` passed straight into OSRM's URL profile segment" clause only. Everything else in #13 and all of #14 stands. Any future OSRM-backed feature selects its graph by base-URL-plus-prefix, never by the profile segment, and reuses `fetchRoute` rather than adding a second fetch function. Before trusting any routing response's `duration`, check it actually differs across modes -- a wrong-profile server fails silently with a plausible number, not an error. Both FOSSGIS and the old demo server carry the same ceiling (1 req/sec, no SLA, non-commercial only); if uptime or volume outgrows it, point `OSRM_BASE_URL` at self-hosted instances using the same prefix shape, one per mode, or a paid provider.

---

**#:** 16
**Milestone:** Directions state and user location moved from discover.tsx to public-shell.tsx; one-shot geolocation replaced with a live watch

**Decision:** Two related bugs, one fix, since both came from the same root cause. `userLocation` and the entire Directions session (`route`, `directionsPanelResult`, `selectedMode`, `routeDuration`, `modeLoading`, `modeErrorReason`, plus `handleRouteFound`/`handleSelectMode`/`handleCancelDirections`) were `useState`/handlers declared directly inside `DiscoverPage`. React destroys page-local state on unmount, and every tab switch unmounts `DiscoverPage`, so navigating off Discover and back silently cancelled an in-progress route and lost the last known position -- not a bug in the panel's wiring (entry #13/#14's own logic was already correct), a lifetime-scoping problem. `userLocation` was also a single `getCurrentPosition` read, so even without navigating away, it stayed pinned to wherever the phone was the instant Discover first mounted while the person kept walking.

Fix: both moved to `public-shell.tsx`, following the exact precedent `GlobalSearchContext` already set for this same class of problem (see entry #9). Two new contexts, `UserLocationContext` and `DirectionsContext`, both provided from `PublicShell()` itself -- the one component that wraps every public route and does not unmount on a tab switch. `useDirectionsState(userLocation)` is a local hook inside `public-shell.tsx` holding the six fields and three handlers verbatim (same logic, same ordering, same `fetchRoute`/`DirectionsError` handling as before, only relocated); `useUserLocation`/`useDirections` are the two new page-facing hooks, matching `useGlobalSearchQuery`'s existing shape exactly. `discover.tsx` now calls both hooks instead of declaring the state itself; every downstream consumer (`DiscoverMap`, `DiscoverList`, `DirectionsPanel`, `ResultCard`) needed no change at all, since all of them only ever received this state as props, never owned it.

Separately, `userLocation`'s source changed from a single `getCurrentPosition` call to a `watchPosition` subscription with `enableHighAccuracy: true`, owned by `PublicShell`'s own mount/unmount (one subscription for the session, `clearWatch` in the effect's cleanup). This makes the location track actual movement continuously, matching how Google Maps keeps a live position while a route is open, rather than freezing at the first fix.

**Standing rule:** Any future state that needs to survive a tab switch (not just Directions/location) follows this same shape: a context provided from `PublicShell()`, a `use*` hook matching `useGlobalSearchQuery`'s naming and error-if-outside-provider pattern, state and logic lifted verbatim rather than reshaped in the move. Page components stay thin consumers of shell-level state for anything that must outlive their own mount. Any future one-shot geolocation read should default to `watchPosition` instead unless a single snapshot is specifically what's wanted (e.g. a one-time "center map here" action) -- `enableHighAccuracy: true` is the default for anything guiding a person's live movement, plain `getCurrentPosition` accuracy defaults are fine for a single low-stakes read.

---

**#:** 17
**Milestone:** Content population (build-order.md step 11) — seed.sql real content replacement

**Decision:** `supabase/seed.sql` rewritten in one pass per content-replacement-plan.md and resume-plan.md: all sample "Demo ..." rows removed from Places (10), Businesses (8), Routes/Trails (3), and Events (6), replaced with real CATO-submitted content from NEW_DATA.md plus storage-manifest.md's photo paths. Places: 5 rows (4 CATO-submitted heritage sites plus Youth Development Center per open-questions.md #7), all `verified`, `category_id`/`facility_ids` resolved via the same subquery pattern the original seed used. Businesses: 3 rows (Panaderia Dimas-Alang, Three Sisters' Restaurant of Pasig with the corrected West Capitol Drive address per open-questions.md #4, Ado's Panciteria), all `verified`; `business_categories` trimmed from the original 7-row demo list to the 2 real categories used (Food Stall, Restaurant). Events: 3 rows, real CATO announcements, `category_id` resolved against migration 0032's 3 new rows (Cultural & Heritage, Youth & Education, Arts & Culture); all 3 land as `lifecycle_status = 'past'` since their real submitted dates (Feb/May/June 2026) are already behind this seed's "now".

Per open-questions.md #8's resolution: Routes/Trails (routes, route_stops, discovery_content, trail_credentials) and the personal-record tables that referenced sample route/place ids (completed_routes, user_credentials, saved_routes, saved_places) are dropped entirely, left empty, not seeded with placeholder trails over the new real content. Documented inline in seed.sql with a comment block explaining what's missing and how to resume once real Trail data exists, rather than silently vanishing from the file.

Two gaps flagged and resolved with the human present rather than guessed at silently: (1) business_items needed individual item name/price rows but NEW_DATA.md only gave a per-person price range per business — resolved by web-researching real, sourced menu items and prices for each business (Wanderlog for Panaderia Dimas-Alang, imenuph.com for Three Sisters', a public menu listing for Ado's Panciteria), flagged in seed.sql's own comment as prototype-quality research pending CATO's official itemized list; (2) no lat/long was supplied for any Place or Business — resolved the same way, web-searching Wikipedia/Wikidata coordinates for the 3 heritage sites and nearby-landmark coordinates for Plaza Rizal, Youth Development Center, and the 3 businesses, flagged as street/barangay-level accuracy, not surveyed.

Photo URLs use a `:SUPABASE_URL` placeholder substituted per environment, pointing at the `content-photos` bucket paths storage-manifest.md specifies; the 30 real photo files still need to be uploaded to that bucket before these URLs resolve to anything (unchanged from resume-plan.md's own note — this pass did not touch the upload step, only the seed.sql references to those paths).

**Standing rule:** Any future content-population pass that finds a table it cannot seed with real, sourced data (as opposed to a table it chooses to leave empty on a confirmed decision) should research and cite real sources the way this entry's business_items/coordinates gap was handled, not fabricate plausible-looking values silently — and should flag the research as prototype-quality pending official confirmation, the same way this entry does. Any future pass that drops an entire seeded section (as Routes/Trails was dropped here) documents why inline in seed.sql itself, not only in a planning doc, so the file stays self-explanatory to whoever opens it next.

---

**#:** 18
**Milestone:** Landing page with hero carousel; Login/Signup become a short popup (landing-hero-plan.md, landing-hero-phases.md)

**Decision:** Two changes shipped together. First, a public landing page at `/welcome` — two column hero on desktop (copy/actions left, an image carousel right), one column stacked on mobile — replacing the previous "no landing page, `/` is the Home feed" state. `/` stays the Home feed for everyone, Guest included; the landing page is an entry surface for someone arriving cold (e.g. a heritage-site link), not a gate everyone passes through, per navigation-and-access-control.md's existing Guest access to Home/Discover/Trails. Second, Login and Signup become a short, centered popup (`auth-modal.tsx`) with two modes, no image panel, no carousel, no tagline — auth surfaces and landing marketing content are two different concerns and share no file.

The fifth `system_permission` value, `manage_landing`, was added across all six sites that reference the permission set in one pass: the 0002 check constraint (dropped and re-added in 0033, 0002 itself never edited, per README's migration rule), `auth-types.ts`'s `SystemPermission` union, `staff-form-dialog.tsx`'s `SYSTEM_PERMISSIONS`, `admin-staff.tsx`'s `PERMISSION_LABEL`, `admin-sidebar.tsx`'s nav item, and `App.tsx`'s route guard. None of the four existing permissions were reused; folding this into `manage_places` would hand every place editor control over the first screen a new visitor sees.

Storage: 0031's `content_photos_write_staff` only checks for `admin`, `manage_places`, or `review_businesses`, so a staff member holding only `manage_landing` would pass the new `landing_slides` table insert and then fail the file upload. Fixed with a new policy in 0033 (`landing_photos_write_staff`), not an edit to 0031, since storage policies are OR'd.

Data: new table `landing_slides` (0033), not a caption column on `place_photos`/`business_photos` — open-questions.md #6 already resolved those two as no caption column, and this is a separate table for a separate purpose. `landing_slides_select_public` has no `to` clause and is gated only on `active`, since the landing page and the auth popup both render for a signed-out visitor; a staff-scoped read would show an empty hero to every real visitor. `landing_slides_write_staff` mirrors 0003's `places_write_staff` shape exactly. The existing `content-photos` bucket (0031) is reused with a `landing/` prefix, alongside `places/` and `businesses/`.

Auth as a short popup: state (`open`, `mode`, `openAuth(mode?)`, `closeAuth()`) is provided from `App`, not from `PublicShell`, since the modal is needed by the Landing page and by `protected-route.tsx`, both outside `PublicShell`. This is the one deviation from entry #16's standing rule that state needing to survive navigation is provided from `PublicShell()` — a level up, so there is one provider and one mounted modal, but everything else about the shape (a context, a `use*` hook matching `useGlobalSearchQuery`'s naming and its error-if-outside-provider check) follows #16 exactly. `login.tsx`/`signup.tsx`'s form logic was lifted verbatim into `login-form.tsx`/`signup-form.tsx`, only the `AuthLayout` wrapper and `tagline` prop dropped. `/login` and `/signup` stay as routes — they no longer render pages, each opens the popup directly over whatever is behind it (defaulting to the landing page when nothing else is) — for three reasons: Supabase email confirmation links point at the app and need somewhere sane to land, `protected-route.tsx` needs a real redirect target, and existing bookmarks keep working. All fourteen guest-gate call sites across twelve files (public-shell.tsx, public-sidebar.tsx, use-saved-toggle.ts, save-button.tsx/save-route-button.tsx via the hook, trail-detail.tsx, saved.tsx, profile.tsx, settings.tsx, vendor-dashboard.tsx, vendor-items.tsx) now call `openAuth("login")` instead of navigating away, except `protected-route.tsx`, which keeps its redirect since a route-level guard has no "in place" to return to.

Caption legibility for the hero carousel was decided fresh, not inherited from entry #2's retired scrim: a solid caption bar under the image, using the card surface token at full opacity, not a gradient over the photo. This satisfies ux-ui-guidelines.md's ban on structural gradients without asking for a new exception, and is simpler than the scrim it replaces.

**Standing rule:** Any future pre-auth content (rendering before sign-in) follows this anon-read-plus-staff-write RLS shape. Any future carousel reuses `filmstrip.ts`, never a new carousel dependency. Any future `system_permission` value update touches all six sites listed above in one pass, not incrementally. Any state needed both inside and outside `PublicShell` is provided from `App`, following entry #16's shape but not its mount point. Auth surfaces (login, signup, any future step like password reset) stay plain forms with no imagery — landing page marketing content and account forms are two different concerns and do not share a file.

---

**#:** 19
**Milestone:** Activity log (activity-log-plan.md, activity-log-phases.md)

**Decision:** Append only `activity_log` table (0037) with admin only read, where triggers capture data actions, one `log_auth_event` RPC captures sign in and sign out, and the create-staff-account function inserts `staff_created` itself. The review tables own `verified` and `rejected`, so places and businesses ignore `verification_status` and an approval logs once. `route_stops` and `place_photos` log inserts and deletes only, so trail stop reordering stays invisible.

**Standing rule:** Any new staff writable table gets its `log_activity` trigger in the same migration, and any new sign in path calls `log_auth_event`. Run `supabase/activity_log_check.sql` after any change to a log function.

---

**#:** 20
**Milestone:** Rules field (0039, rules-field-plan.md, rules-field-phases.md)

**Decision:** `places` and `businesses` each gained one nullable `rules` text column (0039), no default, no check, per entry #7. The 500 character cap lives in the forms only, like every other text column on these tables, so raising it later is one number per form. No RLS or `log_activity` change: policies are row based and the log diffs whole rows. `seed.sql` stays as is, since entry #17 bars invented content and a made up rule would read as real CATO content. Place form: step 2, first field, above the history fields, and the step label reads "Rules and history". Business form: right after Opening Hours, shared by the admin and vendor forms. Public pages: Rules sits right after the last visit info section (after Facilities on a place, after Contact on a business), before long content such as Items, with the same heading and text styles as the sections beside it, line breaks kept, hidden when empty.

Directions discussed, per rule 6: on the place form, the hours column or the left column on step 1; on the public pages, last or right after Hours. Chosen instead: step 2 and after Facilities or Contact. Step 1 stays as it was, two columns and the same fields. Rules are short and quick to fill, so they lead step 2 with history last, in one card with no inner card, per ux-ui-guidelines.md's card nesting and fragmentation rules. On the public pages, after Facilities or Contact keeps the visit info together and ahead of anything that can run long. Google Maps puts "Know before you go" just under a place's basic info, and Airbnb and Booking.com ("The fine print") each give rules their own section.

**Standing rule:** A new visit info text field takes the same public position, right after the last visit info section and before long content. A new optional column takes the entry #7 shape.

---

**#:** 21
**Milestone:** Location field (location-field-plan.md, location-field-phases.md)

**Decision:** A draggable map pin sets `latitude` and `longitude` on `places` and `businesses` (no schema change, both columns exist nullable since 0003/0004). The pin is the source of truth; the Address field is a label filled from the pin, editable, and a drag never overwrites typed text. Provider is Photon's public server (free, no key, search and reverse), one base URL constant in `geocode.ts`, same shape as `OSRM_BASE_URL`. Address is basic info shown as a muted line under the category line on both public detail pages, outside entry #20's visit-info position rule, since it is a label rather than a visit info block. The pin is required on all three forms (admin place, admin business, vendor), which repairs old rows with no coordinates on their next edit.

Checks done before build: Photon answers browser calls with no CORS preflight (`limit` and `bbox` accepted, `lang` untested and left out). Searching the 8 seeded rows found 5 within 150 m of the seeded point and 3 farther off (cathedral, Panaderia Dimas-Alang, Three Sisters'), so the results list shows every hit and never auto-picks the top one. Reverse lookup on all 8 seeded points returned the barangay under `locality` (not `district`, which holds a congressional district); `street` was missing on 3 of 8 and `housenumber` on 7 of 8, so `formatAddress` treats every part as optional. Photon's public server is a demo with no uptime promise, asks for fair use, and carries no attribution requirement beyond Discover's existing OSM credit. Hosted counts: 2 of 7 places and 0 of 3 businesses had null coordinates going into this change.

Directions weighed, per rule 6: autocomplete-first (type an address, suggestions appear as you type, pin follows the pick), pin-first (place the pin, address fills in and stays editable), and both equally (neither leads). Chosen: pin-first. Pasig addresses commonly use lot, block, sitio and barangay, and OSM house-number coverage here is patchy (7 of 8 seeded points had none), so an address-led flow would frequently have nothing to suggest or match. A pin is exact regardless of how the address is written, and it is also the value every other feature (Discover's map, directions, distance sort, trail stop unlocking) actually depends on. Autocomplete still exists as a convenience — search on Enter, not as you type, to respect Photon's fair-use terms and avoid a debounce — but it only ever sets the pin; it never contributes an address string the pin can't back up.

**Standing rule:** Any future map picker or geocoder call goes through `geocode.ts` and `location-picker.tsx`. A new provider is one base URL change.

---

**#:** 22
**Milestone:** Location gets its own step on the admin place form

**Decision:** `admin-place-detail.tsx`'s New Place / Current Info form goes from two steps to three: step 1 is Place (identity + details on the left, Operating Hours on the right, two columns from `lg` up), step 2 is Location (the Address field and map pin, one column, full width), step 3 is Rules and history, unchanged. The location picker previously shared step 1's right column with Operating Hours (entry #21); it now gets a full page of its own, same reasoning entry #20 used to give Rules and history their own step rather than crowding step 1 further. `missingRequired` (the Save gate) is unchanged, but the per-step Next button now gates only on that step's own fields: step 1's Next checks Place Name and Category, step 2's Next checks Address and Map pin. Enter inside a step 2 field (other than the location picker's own search box) now advances to step 3 instead of submitting, matching step 1's existing Enter-means-Next behavior. No other form (admin business, vendor) changes; they were never step based.

**Standing rule:** Any future field added to the place form goes on the step that already owns its topic (identity/details/hours on step 1, location on step 2, history on step 3); a new topic big enough to want its own step follows this and entry #20's pattern rather than being folded into an existing step's column.

---

**#:** 23
**Milestone:** Details / History (or Story) tab control on the public detail pages

**Decision:** Both public detail pages (`discover-place-detail.tsx`, `discover-business-detail.tsx`) split their single long scroll into a segmented tab control, reusing the existing `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` primitive `discover.tsx` already uses for its map/list switch, rather than a new component. A place gets "Details" and "History"; a business gets "Details" and "Story", matching the field each table already uses (`historical_background` on places, `business_story` on businesses, both from data-model.md's own field lists). "Details" keeps every visit-info block each page already rendered (description, hours, entrance fee/contact, facilities, rules, and on a business the item list); the long-form background field moves to the second tab. Defaults to "Details" on load, since a user arriving from a marker or list row is most likely after visit info, not history.

The place History tab also now surfaces `historical_significance`, `year_or_period`, and `source_reference` (all `places` columns since 0003, all already admin-editable on `admin-place-detail.tsx`), and the business Story tab surfaces `unique_specialty` (a `businesses` column since 0004, already vendor- and admin-editable on `business-fields.tsx` and `admin-business-detail.tsx`). None of these four had any public render before this change; they were staff/vendor-fillable with nowhere for a resident or guest to actually read them. data-model.md groups each with its page's respective long-form field under the same background note, so each joins that field's tab rather than staying unrendered. Both tabs carry their own empty state ("No details listed yet." / "No history has been added for this place yet." / "No story has been added for this business yet.") rather than hiding the tab itself, since the tab control is structural and a place or business with no history yet is still a valid record to browse.

**Standing rule:** A new visit-info field takes the Details tab, in the same position rule entry #20 already set (after the last visit-info block, before long content). A new long-form or background field takes the History tab on a place or the Story tab on a business. Any admin- or vendor-editable field that reaches this point without a public render should be treated as a gap to close, not left as staff-only content.

---

**#:** 24
**Milestone:** Item photos (0040, item-photos-plan.md)

**Decision:** `business_items` (0004) gains optional photos through a new child table, `business_item_photos`, rows not an array, same shape as `business_photos` (0008) one level deeper (`item_id` references `business_items`, not `business_id` directly). Owner-plus-staff RLS, matching `business_items`/`business_photos` exactly: a vendor writes their own items' photos, staff with `review_businesses` or admin can view but never upload, since item review is read only per `admin-panel-spec.md`. Public select checks the parent business is `verified` or `pending`, matching migration 0016's widen of `business_items_select_public`, checked directly rather than assumed narrower.

Reused the existing `content-photos` bucket (0031) with a `businesses/<business_id>/items/<item_id>/...` path. No new storage policy: `content_photos_write_own_business` (0031) already checks only that the business id appears somewhere in the object path, so this path shape is already covered.

No `log_activity` trigger. Checked `0037_activity_log.sql` directly rather than assuming every new staff-writable table needs one per entry #19's standing rule: `business_items` and `business_photos` are both explicitly named in that migration's own "Not attached" list, since neither has a staff write screen. `business_item_photos` follows its two closest relatives, not entry #19's general rule, since that rule's own reasoning (a staff action worth logging) doesn't apply to a table staff can only read.

Upload UI lives in `vendor-items.tsx`'s existing edit-row state only, not the add-item form: a photo needs an `item_id` to upload against, which doesn't exist until the item is first saved. Add-then-edit is the path to give a new item its first photo. `avatar-upload.tsx` was not reused directly, its single-photo overwrite shape doesn't fit a multi-photo add/remove list; a new small `ItemPhotos` component reuses its upload/remove mechanics and label-wrapping-hidden-input pattern instead of copying the whole component.

**Standing rule:** Any future per-item or per-row photo set (not per-parent-record) follows this same shape: a child table one level under the record's own photo table if one exists, owner-plus-staff RLS matching the parent's own split, reusing `content-photos` with a path that keeps the top-level owning record's id in it rather than a new bucket or new storage policy. Before attaching a `log_activity` trigger to a new table, check whether its closest existing relative already has one; a table with no staff write screen gets no trigger, regardless of entry #19's general rule.

---

**#:** 25
**Milestone:** Item list menu card layout (item-menu-card-plan.md)

**Decision:** The item list on `discover-business-detail.tsx` and `vendor-items.tsx` changed from a text row list to a card grid: photo on top, name and price below, matching a familiar menu-picker shape (checked real references, food delivery apps' own item cards, per ux-ui-guidelines.md's Inspiration Rules, before building). `grid grid-cols-2 gap-3` at 2 or more items; exactly 1 item renders as a single half-width card with no grid wrapper, since Component Sizing Rules bars a grid for one item.

A Products/Services segmented control was raised alongside this and turned down. `business_type` (Product, Service, or Both) is set once for the whole business at listing creation, per vendor-mode-spec.md's Business Listing Type and Items section. The Item List under it is documented as one flat list with no per-item type field, in that section or in data-model.md's field list. Adding a per-item type column isn't asked for in either doc, so it wasn't built. Seed data also has no business typed "Both" yet, so a split would often show one empty side with nothing in it.

`vendor-items.tsx`'s previous single outer card (wrapping the whole list) was removed once each item became its own card, per Card and Table Rules, a card inside a card. The empty-photo state on a card is a plain muted square, no invented icon, per Icon Rules (no established icon exists for "no photo yet"). The admin review list (`admin-business-detail.tsx`'s `ItemList`) was left as a row list on purpose, staff there scan many businesses for accuracy, a photo grid is browse density, not audit density, and nothing about that screen was described as menu-like.

The edit-row state in `vendor-items.tsx` (name, price, `ItemPhotos`) stays a full-width `col-span-2` cell while a card is open for editing, a form doesn't fit inside a small grid card, then returns to a normal card on save or cancel.

**Standing rule:** Before proposing a new segmented control or filter, check whether the field it would split on is documented as per-item or per-parent-record. A control that needs a field the docs only define one level up is a schema change, not a UI change, and needs its own decision, not a default add. Before any new visual layout, check ux-ui-guidelines.md's Inspiration Rules and pull 2-3 real references first; this codebase already has established card, list, and icon precedent (`line-clamp-2`, `aspect-square`, the file-input-as-label pattern) that should be reused before inventing a new one.

---

**#:** 26
**Milestone:** Items own tab, tab label from business_type (discover-business-detail.tsx)

**Decision:** The item card grid moved out of the Details tab into its own third tab on the public business page, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, the same primitive Details/Story already use. Reason: Details' own empty state check used to fold in `items.length === 0`, so a genuine items fetch failure and a business that legitimately has zero items looked identical, both silently showed nothing extra inside Details. Its own tab makes that gap visible on its own, and keeps Details' empty check to the fields that actually belong to Details.

The tab only renders when `items.length > 0`. A service-only or items-less business does not get an always-empty third tab, same reasoning that already made the items block itself conditional.

Tab label reads `business_type` (Product, Service, or Both, vendor-mode-spec.md's Business Listing Type) rather than the business's category text: Products for Product, Services for Service, Products & Services for Both. Category (`business_categories`, migration 0027) is an open, admin-managed list with no fixed values, not safe to pattern match for a label; `business_type` is the one stable, structured field that already exists for exactly this distinction, and the label uses the same words the spec already uses for the field.

`business_type` is now selected on this page's `businesses` query, it had no public render anywhere before this. `itemsLoaded` state added alongside the existing `loading` state, so the tab strip (2 columns vs 3) does not render before the items fetch settles and does not shift column count after first paint.

**Standing rule:** A label for something the vendor self-classifies (business_type, category, or similar) should read from the structured field meant for that classification, not be inferred from free text elsewhere. When a UI element's presence depends on data that loads separately from the page's main record, gate that element's first render on both fetches settling, not just the main one, so its layout doesn't shift after paint.
