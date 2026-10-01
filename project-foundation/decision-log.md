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
**Milestone:** Resident desktop layout, Home first (page-container.tsx)

**Decision:** Home no longer sits in a 448px column at desktop widths. A shared `PageContainer` (`components/public/page-container.tsx`) is meant to replace the `mx-auto flex max-w-md flex-col gap-6 px-6 py-6` wrapper copy-pasted across the resident pages, with two widths: `narrow` (today's `max-w-md`, for forms and settings) and `wide` (`md:max-w-5xl`, for feeds and grids). Below `md` both are the same 448px column, so mobile is unchanged. Home and Trails use `wide` so far; the other pages migrate one at a time, each checked at desktop widths.

The desktop shell pins `SidebarInset` at `--sidebar-width-icon` while an expanded rail (`--sidebar-width`) sits on top of it, so the left `--sidebar-width` minus `--sidebar-width-icon` (160px) of every page is covered. `wide` reserves twice that amount, read from the shell's own CSS variables, so content stays centered and clear of the rail. The clearance lives in the container rather than the shell, because Discover renders through the same Outlet as a full bleed map and must not be padded.

Home changes: the announcement carousel picks 1 or 3 tiles per view from its measured width (odd counts only, so `filmstrip.ts`'s centered wrap flips tiles off screen) and becomes a static row with no autoplay and no dots when there are no more announcements than tiles. Category photo rows step from 144px to 176px cards at `md` and gain Lucide `ChevronLeft`/`ChevronRight` scroll buttons at `md+`, only while the row overflows. Verified listing rows become one line (name, category, badge) at `md`. Trails stays a list of rows, not a card grid (each row is two text fields, per the existing row shape in `trail-card.tsx`): `PageContainer` wide, rows bleed to the container edge (`-mx-6`) like Home's verified list, and each row is one line at `md` (name left, theme, duration and budget right) through an opt-in `inline` prop on `TrailCard`, because `saved-trail-row.tsx` and `completed-trail-row.tsx` wrap the same row in Saved's narrow column and rely on the stacked shape. `landing.tsx` renders the same `CategoryPhotoRow`, so it gets the larger cards and arrows too, per the same component looking the same everywhere.

Directions weighed, per rule 6: announcements as a right hand column beside the showcase, versus one wide column. Chosen: one wide column. After the rail clearance, usable width at a 1280px window is about 900px, and a two column split leaves each side cramped.

**Standing rule:** A new resident page uses `PageContainer`, `narrow` unless it is a feed or grid. Never hardcode a page width, and never pad the shell to clear the rail. Any new multi tile carousel keeps to odd tile counts or flips tiles off screen.

---

**#:** 23
**Milestone:** Icon library swap (Lucide to Phosphor)

**Decision:** `lucide-react` is replaced by `@phosphor-icons/react` (^2.1.10) across `src/`, on direct instruction that Lucide reads as generic. This overrides the project's earlier use of Lucide (named in `hero-carousel.tsx`'s old comment and `location-field-plan.md`'s icon table, which is left as written). The strings stored in the `icon` columns (`place_categories`, `trail_categories`, `event_categories`, `business_categories`, `place_facilities`) keep their Lucide-style values ("landmark", "building-2", "square-parking"), so there is no migration; only the component each string resolves to changed, in the five `*-icons.ts` maps. Renames worth knowing: Chevron to Caret, Search to MagnifyingGlass, Settings to Gear, Home to House, Map to MapTrifold, Landmark to Bank, Castle to CastleTurret, Croissant to Bread, Loader2 to CircleNotch, ImagePlus to CameraPlus, and SquareParking to LetterCircleP because Phosphor has no parking icon. Filled states now use `weight="fill"` instead of Lucide's `fill-*` classes: the saved Heart, the completed CheckCircle, the radio-item Circle, and the map and location-picker pins (the pins lose the card-colored outline, which Phosphor has no stroke to set). The bottom nav stays outline-only, per its existing direct request.

**Standing rule:** New icons come from `@phosphor-icons/react` only, `regular` weight by default and `fill` only for a selected, saved or completed state. No second icon library.

(Amended by #24: duotone is now the default weight and the bottom nav fills when active. Weight amended again by #25: bold.)

---

**#:** 24
**Milestone:** Icon weight, duotone default and filled active nav (amends #23)

**Decision:** Regular weight read too thin, so duotone is now the default for every Phosphor icon, set once through `IconContext.Provider` in `main.tsx` instead of a `weight` prop on each icon. The nav icons (`bottom-nav.tsx`, `public-sidebar.tsx`, `admin-sidebar.tsx`, plus the public sidebar's Search row) switch to `fill` while their item is active. The bottom nav's earlier outline-only rule is reversed on direct request. Two spots outside the provider's reach set the weight themselves: the unsaved Heart in `save-button.tsx` and `save-route-button.tsx` (was an explicit `regular`, which would have overridden the default) and the category icon in `discover-map.tsx`'s `markerElement` (rendered with `renderToStaticMarkup`, outside the React tree).

CI fix in the same pass: `supabase db lint --linked=false` connected to the remote project because the CLI treats a passed `--linked` flag as set whatever its value, so the job timed out on the pooler. It is now `--local`. `supabase/.temp` is listed in `.gitignore` but is tracked in the repo, which is how CI found a linked project.

**Standing rule:** New icons come from `@phosphor-icons/react` only, and take the duotone default from `IconContext` with no `weight` prop. `fill` marks a selected, active, saved or completed state. No second icon library. Any icon rendered through `renderToStaticMarkup` passes `weight` itself.

(Weight amended by #25: duotone is dropped, bold is the default.)

---

**#:** 25
**Milestone:** Icon weight, bold default replaces duotone (amends #24)

**Decision:** Duotone is dropped on direct request and bold is the default for every Phosphor icon, still set once through `IconContext.Provider` in `main.tsx`. Filled active and saved states are unchanged. The places that set their own weight now pass `bold` for the resting state: the nav icons in `bottom-nav.tsx`, `public-sidebar.tsx` (including its Search row) and `admin-sidebar.tsx`, the unsaved Heart in `save-button.tsx` and `save-route-button.tsx`, and the category icon in `discover-map.tsx`'s `markerElement`. Nothing else in `src/` referenced duotone. The CI fix recorded under #24 is untouched.

**Standing rule:** New icons come from `@phosphor-icons/react` only, and take the bold default from `IconContext` with no `weight` prop. `fill` marks a selected, active, saved or completed state. No second icon library. Any icon rendered through `renderToStaticMarkup`, and any icon with a conditional `fill`, passes its resting `weight` itself as `bold`.

---

**#:** 26
**Milestone:** Admin sidebar header matches resident view

**Decision:** The admin sidebar header now uses the same row as the resident sidebar. Expanded: logo and "Lakbay Pasig" wordmark (replacing "CATO Admin"), linking to `/admin`, with a collapse button on the right. Collapsed: one logo button that becomes the expand icon on hover. The row was moved out of `public-sidebar.tsx` into `src/components/sidebar-logo-row.tsx` (`SidebarLogoRow`, takes the link target as `to`) so both sidebars share one component instead of two copies. `public-sidebar.tsx` passes `to="/"`, `admin-sidebar.tsx` passes `to="/admin"`. Other "CATO" references (landing page contact details, staff copy) are the tourism office's name, not the admin label, and are unchanged.

**Standing rule:** Any sidebar header row uses `SidebarLogoRow`. Do not copy the logo/collapse markup into a new sidebar.

---

**#:** 27
**Milestone:** Category colors (category-colors-plan.md, category-colors-phases.md)

**Decision:** `place_categories` and `business_categories`, the two lists shown on the map, each gained one nullable `color` text column (0041), no default, no check, per entry #7. It stores a palette key, not a color value, and the palette lives in code: ten fixed keys (red, orange, green, teal, blue, indigo, purple, pink, brown, slate) in `src/lib/category-colors.ts`, each with a `--category-<key>` token in `:root` and `.dark` plus one `--category-foreground` for the glyph. `categoryColor(key)` returns `hsl(var(--category-<key>))` and falls back to blue (`DEFAULT_CATEGORY_COLOR`) for null or an unknown key, so old rows keep working with no backfill. The Discover marker is now a filled circle in the category color with a `--category-foreground` glyph, and the label takes the category color over the existing halo. The ring now shows status: verified is a solid `--card` ring, pending is a dashed `--muted-foreground` ring. The old primary ring is gone, so status needed its own signal. Color is applied with inline `style`, since the keys are dynamic (Tailwind classes would need a safelist) and markers are built outside React. `createCategoryCrud(table, { color: true })` selects and writes `color` only for the two map lists, since the other three tables have no such column. The admin dialog shows a swatch row only when `config.colors` is set, and the admin table icon renders in its color. No RLS or `log_activity` change: policies are row based and the log diffs whole rows (#19). `seed.sql` stays as is, categories are inserted without a color.

Directions weighed, per rule 6: color on all five category tables (no flag in the crud, dialog or admin, but three unused columns, since Trails, Announcements and Facilities never appear on the map), a free hex picker (cannot promise contrast for the glyph and label in both themes), and a light and dark pair per category (the ten palette values already handle both themes). Chosen instead: two tables, ten fixed keys. Every palette value passes 4.5:1 for glyph and label in both themes (4.9 to 9.2 measured for the glyph, against the fill). Discover filter chips stay uncolored, because chips filter a list and color there adds noise.

**Standing rule:** A new color is a token in both themes plus one `CATEGORY_COLORS` row, and it must pass 4.5:1 for glyph and label in both themes. A new category list that shows on the map gets the `color` column and `colors: true`. Deploy order: the migration runs before the app build goes live, since the app selects `color`.

---

**#:** 28
**Milestone:** Discover map bounds (map-bounds-plan.md)

**Decision:** Discover's map stays near Pasig automatically: no dropdown, no Settings change, no database column. `discover-map.tsx` sets `maxBounds` to a base box of 120.965, 14.455 to 121.195, 14.685 (Pasig's own box plus 0.065 degrees, about 7 km, each side, about 25 by 25 km). The base is sized for tall phones. `maxBounds` keeps the whole screen inside the box, not only the center, so box height decides how wide a route a phone can frame: a 390 by 700 phone frames a route up to 7.5 km wide at 0.03 and up to 10.8 km at 0.065. The base covers Makati, BGC, Ortigas, NAIA, Cubao, Marikina, Intramuros and Antipolo with no growth (checked with approximate coordinates).

Growth is one step. When the live location or a route corner is outside the base and inside the limit box (Pasig's box plus 0.15 degrees, 120.88, 14.37 to 121.28, 14.77, about 43 by 44 km), `growIfNeeded` calls `setMaxBounds` once with the limit box, before the camera moves, and never shrinks for the rest of that mount. A point outside the limit is ignored, so a visitor in Cebu can't lift the lock: no growth, no auto center on the first fix, and Find my location shows "You're outside the map area." in the existing locate error slot with no camera move. Reload or a fresh mount starts at base and re-derives growth from `userLocation` and `route`, which the shell already holds, so nothing is stored.

The numbers live in `map-style.ts` as `[west, south, east, north]` tuples (`PASIG_BOUNDS`, `BASE_BOUNDS`, `GROW_LIMIT`), with `inBounds` and `floorZoom` beside them. `PASIG_BBOX` in `geocode.ts` moved there as `PASIG_BOUNDS` with the same values and is now `PASIG_BOUNDS.join(",")`, so search and the map share one copy. `geocode.ts` imports it relatively, not through `@/`, so `npx tsx src/lib/geocode.ts` still resolves it.

Rotate and tilt are off on Discover, because `maxBounds` assumes north up (a rotated map shows outside the box at the corners) and the heading cone ignores map rotation. There is no `minZoom`: the bounds set the floor on every screen, and an explicit 11 would cut phone routes wider than 10.8 km after growth. `ZoomControl` disables Zoom out at `floorZoom` of the map's current bounds and container size, recomputed on zoom, on resize and when growth happens.

The pin picker map in the business and admin place forms stays unlocked. A vendor near the city edge must place their own pin, and an admin must reach old rows with odd coordinates. Its address search is already limited to Pasig (entry #21). Custom From needs no code: it only comes from the Pasig limited search, a tap on the bounded map, or the live fix, so it is already inside.

Directions weighed, per rule 6: an area dropdown, an inside or outside Pasig rule, and growth by a padded union of the live location and route corners. A dropdown is rejected by constraints.md's Automation First rule (#2), since the step can be done without human input. Inside or outside detection is rejected because it needs a boundary polygon and GPS permission, and the bounds could jump near the border. A padded union follows the route's shape, and a wide, flat route leaves the height unchanged, so a phone still crops it. Chosen: a fixed box with one jump to a bigger one, with no union math and no padding to tune.

Known ceilings, accepted: `maxBounds` takes a rectangle, so parts of neighboring cities stay reachable, and the base lets people wander about 7 km past Pasig's edge, not 3. A route fully inside the base but wider than 10.8 km on a 390 px phone is clipped, and only cross city routes get that wide.

**Standing rule:** Bounds numbers live only in `map-style.ts`. Any camera move that could land outside the base box calls `growIfNeeded` first, or it clamps. The pin picker map stays unlocked. Add a polygon check only if the city border starts to matter, `minZoom: 10` only if a screen shows the bounds floor not binding, and growth for a route wider than 10.8 km only if it shows up.

---

**#:** 29
**Milestone:** Item search (item-search-plan.md, item-search-phases.md)

**Decision:** Global search gained a fifth source, Items, extending #9. `searchItems` in `global-search.ts` follows the same per-table-function-plus-`Promise.all` shape and reads `business_items` (public select 0016) with their first photo (`business_item_photos_select_public`, 0040). The panel shows an "Items" group after Businesses through the existing `ResultGroup`, using a new `ItemRow` (thumbnail, name, price, store, `VerificationBadge`). It fetches 4 and shows 3. The fourth row only proves there are more, and then a "View all" row closes the panel and goes to `/discover`, where the shared query text survives. Rows sort by name, then price low to high, unpriced last. A row opens the store's business page on its items tab (`?tab=items`, which `discover-business-detail.tsx` honors only when the store has items).

`searchItems` filters store status itself (a stores query with `.in(verified, pending)`, see #31 for why it is no longer a `businesses!inner` embed), because `business_items_select_own` and `business_items_write_staff` (0004) let an owner or staff read an unverified store's items. This is the same reason `searchEvents` repeats `published = true`. `searchBusinesses` and Discover's `fetchBusinesses` have the same gap and were left alone, as their own fix.

Discover now matches item names too. `DiscoverBusiness.itemPrices` became `items: { name, price }[]`, built in `fetchBusinesses` and `fetchRecentlyVerifiedBusinesses`. `src/lib/item-match.ts` holds `matchingItem` (lowest priced item whose name contains the query, unpriced only if nothing else matches) and `formatItemPrice`, with a `demo()` that runs under `npx tsx`. The filter and the list card both call `matchingItem`, so the rule lives in one place. The list card adds one line (item name and price) only when an item matched. The map only narrows, with no new UI. No migration, RLS or `seed.sql` change.

Directions weighed, per rule 6: a modal over the map, a separate results screen, a `brand` column, merging the same item across stores, and a sort control. A modal covers the map, which is the point of the search. A results screen was already rejected in #9. A brand column needs a schema change and search on item name already finds a brand typed in it. Merging needs a canonical product, but item names are free text. A sort control is a results screen feature. Chosen instead: one more group in the panel, plus the existing Discover filter.

**Standing rule:** A new searchable type follows the per-table-function-plus-`Promise.all` shape and repeats any status or published filter that the public policy alone does not guarantee for signed in users. The Items group shows 3 of 4 fetched, and its cap stays lower than the other groups because its rows are taller. Add a `pg_trgm` index if the `ilike` scan gets slow at about 300 vendors.

---

**#:** 30
**Milestone:** Verified badge style

**Decision:** `VerificationBadge` (`result-card.tsx`) shows Verified as a Phosphor `CheckCircle` in `text-primary` plus the label "Verified by Pasig Tourism Office" in `text-foreground`, with no filled pill, border or padding. Pending keeps the outline `Badge` and the label "Pending Verification", so the two states still differ at a glance and an unreviewed store never borrows the look of the verified mark. The check is the verified sign users already know from other apps (ux-ui-guidelines.md, Familiarity), and the icon is decorative (`aria-hidden`) because the text carries the meaning. The label text is unchanged, per the v1 scope in navigation-and-access-control.md. The change is in the one shared component, so every surface that shows the badge (map card and hover, Discover list, search panel, Home, Saved) changes together.

Directions weighed: a filled seal icon (heavier, and the default icon weight is bold per #25) and a check only with no text (drops the required label). Chosen: a plain check plus the label.

**Standing rule:** Verified never gets a fill again. Any new surface imports `VerificationBadge` and does not restyle it.

---

**#:** 31
**Milestone:** Typo tolerant search, phases 1 and 2 (public and admin global search)

**Decision:** Global search (#9, #29) now finds names with typos, missing, extra, wrong or swapped letters ("adbo" finds Adobo, "musuem" finds Museum, "resturant" finds Restaurant). Migration 0042 enables `pg_trgm` and `fuzzystrmatch` and adds `search_norm()` (lowercase, accent folding so "nino" finds "Niño", apostrophes dropped, every other run of non-alphanumerics becomes one space, so "Dimas-Alang" and "dimas alang" match and a query of only symbols normalizes to empty and returns nothing), `search_tier()`, `search_fuzzy()`, one trigram GIN index per searched column (places.name, businesses.name, routes.name, events.title, business_items.name, profiles.display_name) and six SECURITY INVOKER functions: `search_places`, `search_businesses`, `search_trails`, `search_events`, `search_items`, `search_staff`. Each returns `setof <table>`, so `global-search.ts` and `admin-global-search.ts` keep their exact `.select()` embeds and row mapping and only swap `.from(t).ilike().limit()` for `.rpc(fn, { q, lim }).select()`. Because they are SECURITY INVOKER and read the real table, every existing RLS policy still decides visibility, and the per-table-function-plus-`Promise.all` shape from #9 is unchanged.

A name matches when it contains the query, or when it passes the trigram prefilter (word similarity 0.2, answered by the index) and either its word similarity is 0.5 or more, or every query word is inside the name or within a few edits of one of its words (0 edits for 1-3 letters, 1 for 4, 2 for 5 or more; `levenshtein_less_equal`, and Postgres counts a swapped pair as 2). Queries under 3 characters only do the contains check. The first version used trigram similarity 0.5 alone. It was checked offline against the seed names with a Python copy of pg_trgm's scoring (it reproduces the documented `word_similarity('word','two words') = 0.8`), and it turned out to miss 60% of swapped letters, 36% of wrong letters and over half of 4-5 letter words, and "adbo" scored 0.40 against "Adobo". The shipped rule found 98% of missing, 100% of extra, 100% of wrong and 95% of swapped letters, 91% for 4-5 letter words. Trigram alone stays inside the rule because the edit distance rule alone loses joined words ("dimasalang"), short spelling variants ("co" for "ko") and long queries with extra words.

Ranking is exact, then starts with, then a word starts with, then contains, then fuzzy, and within a tier by similarity, then name. Fuzzy rescues misses and never reorders a literal hit. `search_events` takes `only_published` (default true; the staff bar passes false so a draft announcement can be found), `search_items` repeats the verified/pending store rule and `search_staff` repeats `role = 'staff'` inside the function, so each function's row cap counts only rows that will be shown. The explicit `.eq("published", true)` in the public `searchEvents` was removed because the function now enforces it; the admin `searchStaff` keeps its `.eq("role", "staff")`. `searchItems` no longer chains `businesses!inner`, `.in("businesses.verification_status", ...)` or a per-embed order and limit onto `.rpc()`: that call answered 400 from PostgREST on the live project, and the catch in `searchEverything` hid it as "No results" (the function itself returned rows when run in SQL). It now takes plain `id, name, price, business_id` from `search_items`, then reads the stores (`.in("verification_status", [verified, pending])`) and the first photo per item (ordered by `sort_order`) with ordinary table queries, keeping the function's row order and dropping any item whose store is not verified or pending. `search_staff` is limited to admins by `profiles_select_admin` exactly as before: anyone else gets zero rows, not an error. Items now sort by match quality first, then name, then price low to high with unpriced last (#29 sorted by name then price only).

Directions weighed, per rule 6: a client side library such as Fuse.js (only works on lists already loaded in the browser, needs a new dependency, and the install was ruled out for this pass), a hosted search service such as Algolia, Typesense or Meilisearch (every table would need syncing and the verified/pending/published rules duplicated in the index, too much for the current data size), and hand-rolled edit distance in the app (rebuilds what `pg_trgm` and `fuzzystrmatch` already ship). Also weighed inside the database: trigram similarity alone (simplest, rejected after the offline check above) and edit distance alone (rejected for the regressions above). Chosen: both, combined, since Supabase ships both extensions and RLS keeps working.

Scope: phase 1 covered the public global search (`global-search.ts`), phase 2 the admin global search (`admin-global-search.ts`, reusing the same functions plus `search_staff`). Not yet changed, each its own phase: Discover's in-memory filter (`filterDiscoverResults`, `matchingItem`) and the admin table filters (admin-businesses, admin-events, admin-categories, admin-activity, place-business-picker, review-history-table). Until Discover is done, typing a typo in the bar shows fuzzy hits in the dropdown while Discover's list and map still filter on an exact substring.

Known ceilings, accepted: words of 1-3 letters get no typo tolerance. No synonyms (Filipino and English terms for the same thing) and no search of descriptions or categories. The 0.2 prefilter is loose on short queries (one shared trigram can qualify a name), so the index narrows less there and the edit distance check does the work; fine at current size, recheck on real data. The thresholds, edit allowances and the 100 character query cap are starting values to tune on real Pasig data. The offline check used 59 seed names heavy in the word "Pasig", so its false-match figures are a rough guide only, and the SQL itself was not run when this was written (no database available). Discover still loads every place and business at once, with no pagination, and PostgREST's default row cap would silently truncate it if the data grows past about 1,000 rows. That is a city scale concern and not part of this change.

**Standing rule:** A new searchable type gets its own `search_*` function built on `search_norm()`, `search_tier()`, `search_fuzzy()` and a trigram index on `search_norm(column)`, called with `.rpc().select()`, and repeats any status or published filter inside the function as well as in the client. The index expression must match the one the function uses or Postgres ignores the index, and changing `search_norm()` means dropping and recreating every one of those indexes. New name search uses this, not `ilike`; the admin and Discover searches move over in their own phases.

---

**#:** 32
**Milestone:** List your business, desktop stepped form

**Decision:** From md up (`useIsMobile` is false), the create branch of `vendor-dashboard.tsx` ("List your business") is the same three step form the admin business review page uses (`admin-business-detail.tsx`, itself modeled on `admin-place-detail.tsx`): Step 1 Business (name, type, category, description, contact, social links, accessibility, registered or informal, with Opening Hours in a right column), Step 2 Location (address and a tall map pin), Step 3 Rules and story. It shows a "Step N of 3: label" row, Cancel on step 1 then Back, Next, and "List my business" on step 3, plus a "Required to continue" line (Business Name and Business Type on step 1, Address and Map pin on step 2). Enter inside a step 1 or 2 field means Next, not save. It reuses `BusinessFields`' existing `section`, `stepHeading` and `className` props through a local `CreateBusinessStepper`, so no field markup was copied. Below md the single scrolling form is unchanged, asterisks and all; the stepped form has no asterisks, like the admin form. The page is `wide` on desktop, `narrow` on mobile.

Not changed: the edit form (still one page on both sizes), `createBusiness`, the payload, the required-field rules and the schema. Nothing about what a vendor must fill in changed, only how the fields are paged on desktop. The stepped form was written without running the app, so the first desktop pass (step order, map height on step 2, Enter handling) is worth a look.

**Standing rule:** If the edit form is later stepped too, it reuses `CreateBusinessStepper`'s shape (or lifts it into its own file) rather than a second copy.

