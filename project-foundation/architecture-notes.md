# architecture-notes.md

---
## AI RULES, READ FULLY BEFORE ANY ACTION
---

1. Read this entire file before proposing any structure, modifying any file, or debugging anything.
2. Project scale drives everything. Read the Scale field first. Do not propose a structure that exceeds what the scale requires.
3. Before touching any file, identify all files connected to it. This map is the reference. If a connection is not listed here, find it before proceeding, don't assume it's isolated.
4. If the structure evolves during the build, update this file. An outdated map is worse than no map.
5. Never create folders or layers the current scale doesn't justify. Don't over-architect small projects or under-structure large ones.

---
## SCALE, READ THIS FIRST
---

**Project Scale:** Medium, multiple features, growing complexity, needs modularity.

Medium scale means feature-based grouping: each feature owns its files, shared utilities live in one place, concerns stay separated without over-engineering.

---
## PROJECT REFERENCE
---

**Project Type:** Progressive Web App

**Tech Stack:**
- Frontend: React with TypeScript, built with Vite
- UI Components: shadcn/ui with Tailwind CSS
- Backend and Database: Supabase, built on PostgreSQL
- Auth: Supabase Auth, email verification only
- Hosting: Hostinger Node.js hosting, deployed through GitHub integration, connected to Supabase through Hostinger's database connector
- Role-based access through Supabase row level security, matching Guest, Registered User, Vendor, and CATO Staff roles

Reasoning: the data model is relational (Places, Trails, Businesses, and Staff permissions all link to each other), so PostgreSQL fits better than a NoSQL database. Supabase's row level security maps directly onto the four user roles. shadcn/ui requires TypeScript, which also gives type safety across the data model for a team of three.

**Module / Feature Map:**
- Home: recently verified content, CATO announcements, program updates
- Global Search: shell-owned search bar, see decision-log.md entry #9
- Discover: map lookup for places and businesses, category/price/facility filters, verification label on every result. Map/List toggle and filters render inside the shell header (public-shell.tsx's `useDiscoverFilters`). discover-map.tsx owns a collapsed legend (Status/Place Categories/Business Categories) and a desktop-only marker hover preview. Directions (mobile and desktop) opens directions-panel.tsx with Car/Bike/Walk mode switching and estimated time, backed by directions.ts's fetchRoute (FOSSGIS OSRM, one instance per mode, see decision-log.md entry #15) -- mobile's is a fixed sheet above the bottom nav (discover.tsx-owned sibling of the Map/List branch), desktop's is a bottom-centered floating card rendered inside discover-map.tsx's own relatively-positioned container, same coordinate space as ZoomControl/MapCornerControls. The Directions session itself (route, selected mode, duration, loading/error, panel result) and userLocation are both shell-owned state (public-shell.tsx's useDirections/useUserLocation), not discover.tsx-local, so both survive navigating off Discover and back. See decision-log.md entries #13, #14, #16
- Trails: catalog, trail detail with sequenced stops, Discovery content unlock, completion, credentials
- Saved: saved places, saved trails, completed trails, earned credentials
- Profile: account info, preferences, vendor mode toggle entry point
  - Settings (`/profile/settings`): theme and font size preference, synced to `profiles.theme_preference`/`font_size_preference`
- Vendor Mode: business listing creation, listing tiers (Basic, Featured), item and price management, vendor dashboard metrics
- CATO Admin Panel: sidebar sections for Places, Businesses, Events and Announcements, Trails, Staff, Landing Page, Activity, each gated by Staff or Admin role. admin.tsx's header holds AdminSearchBar and AdminNotificationBell
  - Categories (`/admin/categories`): one tabbed page managing five admin-controlled category lists (Places, Facilities, Business Category, Trails, Announcements), each its own table/permission/icon shortlist, sharing one list view and one add/edit dialog (category-form-dialog.tsx). Facilities is the one list a record holds several of at once (`places.facility_ids`, uuid[]); every other tab is a single `category_id` foreign key
  - Activity (`/admin/activity`): admin only, read only table of the `activity_log` table (0037), newest 500 rows, client side filters, built on `AdminDataTable`. Not the dashboard's Recent activity feed, which still reads the review tables
  - Landing Page (`/admin/landing`): manages the `landing_slides` table backing the public hero carousel. Simple row list (thumbnail, caption, Active badge, up/down reorder, actions menu), not `AdminDataTable`, gated on the `manage_landing` system_permission. See landing-hero-plan.md
- Landing: public entry page at `/welcome`, outside PublicShell (no bottom nav, shell header, or sidebar). Two column hero on desktop (copy/actions left, image carousel right), one column stacked on mobile. Carousel (hero-carousel.tsx) reuses filmstrip.ts's math, sourced from `landing_slides` (0033). See landing-hero-plan.md
- Auth: Supabase Auth, email verification, role assignment for Guest, Registered User, Vendor, CATO Staff. Login and Signup are no longer their own pages/routes with dedicated layouts -- `/login` and `/signup` render the Landing page underneath with a short, centered auth popup (auth-modal.tsx, login-form.tsx, signup-form.tsx) open in the matching mode, opened from anywhere in the app via `useAuthModal()`'s `openAuth(mode)`. The popup carries no image panel and no carousel; landing marketing content and auth forms are two separate concerns living in separate files. See landing-hero-plan.md, decision-log.md entry #2 (retired) and the new entry covering this change

**Key Dependencies Between Files:**
- auth-context.tsx depends on auth-types.ts, migrations 0001/0002 (profiles columns)
- Admin Places depends on places, place_photos, place_reviews (0003)
- Admin Businesses depends on businesses, business_items, business_reviews, business_flags (0004), business_photos and profiles_select_staff_business_submitters (0008), business_item_photos (0040, read only on this page)
- vendor-items.ts depends on business_items (0004) and business_item_photos (0040), both through content-photos' existing storage policies (0031), no new storage policy added
- Admin Trails depends on routes, route_stops, discovery_content (0005)
- Admin Events depends on events (0006)
- Public Trails/Saved depends on trail_credentials, user_credentials, completed_routes, saved_places, saved_routes (0007), route_progress (0018)
- saved-routes.ts, trail-completion.ts depend on trail-query.ts's exported fetchCredentialNamesByRouteId
- vendor-status.ts depends on businesses (0004), specifically businesses_select_own
- global-search.ts depends on places_select_public (0003), businesses_select_public (0015), routes_select_public (0005), events_select_public (0006). global-search-bar.tsx depends on global-search.ts and result-card.tsx's exported VerificationBadge. public-shell.tsx depends on global-search-bar.tsx. discover.tsx depends on public-shell.tsx's exported useGlobalSearchQuery and useDiscoverFilters
- admin-global-search.ts depends on places_select_staff (0003), businesses_select_staff (0004), routes_select_staff (0005), events_select_staff (0006), profiles_select_admin (0001, via public.is_admin() since 0009). admin-search-bar.tsx depends on admin-global-search.ts. admin-notifications.ts runs its own copy of admin-dashboard.tsx's pending-count queries (kept as two independent copies, not shared). admin-notification-bell.tsx depends on admin-notifications.ts. admin.tsx depends on admin-search-bar.tsx, admin-notification-bell.tsx
- route_stops.stop_id and discovery_content.related_location_id reference either places.id or businesses.id with no foreign key; the app layer must guarantee stop_type/related_location_type matches a real row
- discover-types.ts's DiscoverPlace (including facility_ids) is constructed in discover-query.ts's fetchPlaces, saved-places.ts's fetchSavedPlaces, and home-query.ts's fetchRecentlyVerifiedPlaces. Any new constructor of a DiscoverPlace needs every field added at the same time
- landing.tsx depends on landing-slides.ts (fetchActiveSlides) and hero-carousel.tsx
- hero-carousel.tsx depends on filmstrip.ts (loopIndex, wrappedSlot, shortestStep, tileWidthPx, tileOffsetPx), reused as-is, not copied
- auth-modal.tsx (components/auth) depends on login-form.tsx and signup-form.tsx, and on lib/auth-modal.tsx's AuthModalContext/useAuthModal for open/mode state
- admin-activity.tsx depends on activity_log_select_admin (0037). The log triggers depend on profiles for the actor (`write_activity()` reads auth.uid()). login-form.tsx and auth-context.tsx depend on the `log_auth_event` RPC (0037). create-staff-account inserts into activity_log directly as service role
- landing-slides.ts depends on landing_slides_select_public / landing_slides_write_staff (0033), and content-photos storage bucket (0031) with the landing_photos_write_staff policy (0033) covering the manage_landing permission
- location-picker.tsx depends on geocode.ts (searchPlaces, reverseGeocode, formatAddress) and map-style.ts, and reuses discover-query.ts's Coordinates type and business-fields.tsx's FieldLabel. It is imported by admin-place-detail.tsx (its own step 2, "Location," full width and one column, separate from step 1's two-column identity/details/hours layout), and by business-fields.tsx, which in turn is shared by admin-business-detail.tsx and vendor-dashboard.tsx -- all three forms pick up any change to the picker or the geocoder at once. See decision-log.md entry #21

**Database Schema:**

All tables have row level security enabled. No table grants unauthenticated write access. RLS pattern used throughout: a `_select_public` policy with no `to` clause (covers Guest) gated on a status column (verified, published, active); a `_select_staff`/`_write_staff` pair checking `staff_role = 'admin' or '<permission>' = any(system_permission)`; for owner-writable tables (businesses, saved_*, user_credentials, completed_routes, route_progress) a `using (auth.uid() = <owner column>)` policy. RLS guards rows, not columns: a form letting a vendor edit their own business, or a user edit their own profile, must not submit staff-only or role fields at the app layer.

| Migration | Tables | Notes |
|---|---|---|
| 0001 | profiles | Base auth extension. role (resident, staff), staff_role (staff, admin) |
| 0002 | profiles (extended) | End User fields and staff fields (position, system_permission, contact_number, display_name) |
| 0003 | places, place_photos, place_reviews | Verification status pending/verified/rejected, review log required |
| 0004 | businesses, business_items, business_reviews, business_flags | business_items replaces the single Price Range field. business_flags covers abuse flags and reports |
| 0005 | routes, route_stops, discovery_content | route_stops/discovery_content use a type-plus-id pattern with no foreign key, app layer enforces it |
| 0006 | events | published (draft/live) kept separate from lifecycle_status (upcoming/ongoing/past) |
| 0007 | trail_credentials, user_credentials, completed_routes, saved_places, saved_routes | user_credentials/completed_routes are cohort-stat sources only, never a per-user leaderboard |
| 0008 | business_photos, profiles (new select policy) | Adds business photo storage and a profiles read policy for business submitters (created_at), backing queue-priority signals |
| 0009 | profiles (function only) | public.is_admin(), a security definer function, removes a self-referencing RLS recursion on profiles_select_admin/profiles_update_admin |
| 0014 | place_reviews | Widens place_id to reviewed_type/reviewed_id so one log covers place and discovery_content reviews |
| 0015 | businesses | businesses_select_public widened from verified to verified or pending |
| 0016 | business_items | business_items_select_public widened to match 0015 |
| 0017 | places, businesses | Adds verified_at, nullable, set only on transition into verified |
| 0018 | route_progress | One row per user per route, highest_unlocked_stop_id references route_stops(id), backs mid-trail resume |
| 0020 | events | Adds end_date_time, nullable, toggle-gated in admin-event-detail.tsx, blocked from submit if it's at or before date_time |
| 0021 | profiles | Adds theme_preference, font_size_preference, both nullable text with a check constraint. See decision-log.md entry #7 |
| 0022-0025 | place_categories, trail_categories, event_categories (new tables), places/routes/events | Each category table: id, name, icon, active, sort_order, timestamps; RLS public-read-active plus its own manage permission/admin write. Each parent table's old text category column dropped after backfill, replaced by category_id |
| 0026, 0028 | place_facilities (new table), places | Same shape as place_categories, RLS scoped to manage_places/admin, 4 seed rows (Restrooms, Parking, Info Desk, Waiting Area). places.facility_ids (uuid[], many-to-many) added; old places.facilities (text[]) dropped after backfill. 0028 repairs a backfill mismatch on pre-existing dirty data |
| 0027 | business_categories (new table), businesses | Same shape as place_categories, RLS scoped to review_businesses/admin, no seed rows. businesses.category_id added nullable; old businesses.category renamed category_text_legacy (kept, not dropped, not read by app code) |
| 0029 | (extension only) | Enables pgcrypto. Harmless safety net; the actual seed-step fix is schema-qualifying crypt()/gen_salt() calls to extensions.crypt()/extensions.gen_salt() in seed.sql, since search_path doesn't reliably include the extensions schema on `db reset --linked` |
| 0030 | profiles | Adds profile_picture, username (unique partial index), first_name, last_name, all nullable. See decision-log.md entry #12 |
| 0033 | profiles (constraint swap), landing_slides (new table), storage.objects (new policy) | Fifth system_permission value, `manage_landing` (constraint dropped and re-added, 0002 itself untouched). landing_slides: id, image_url, caption, sort_order, active, timestamps -- backs the `/welcome` hero carousel. `landing_slides_select_public` has no `to` clause (renders pre-auth); `landing_slides_write_staff` mirrors 0003's places_write_staff shape. `landing_photos_write_staff` closes a gap 0031 left for the manage_landing permission on the content-photos bucket, added here rather than editing 0031 |
| 0037 | activity_log (new table), profiles, plus triggers on the content tables | Append only, admin read only. `write_activity()` helper, three trigger functions (`log_activity`, `log_activity_child`, `log_review_activity`), and the `log_auth_event` RPC. See decision-log.md entry #19 |
| 0038 | places | Drops `nearby_places` (free text, never linked to real rows, never read by any public query). Drop-only, same shape as 0036 |
| 0039 | places, businesses | Adds `rules`, nullable text, no default, on both. Shape from decision-log.md entry #7. The 500 character cap is in the forms only |
| 0040 | business_item_photos (new table) | Optional photos per business_items row, same shape as business_photos (0008) one level deeper (item_id -> business_id). Owner-plus-staff RLS, public select matches 0016's widen (verified or pending). No log_activity trigger, matching 0037's own exclusion of business_items/business_photos. Reuses the content-photos bucket (0031) and its existing storage policies, no new storage policy |

Fields in docs/data-model.md intentionally left out of the schema, since they're derivable from a join table: places/businesses' Trails Included In, routes' Places Included and Place Order (both live in route_stops), trail_credentials.Users Earned. Recomputing these from route_stops and user_credentials avoids duplicated data going stale.

**What Must Never Be Touched Without Human Approval:** Database schema (supabase/migrations/*.sql), auth logic (src/lib/auth-context.tsx, auth-types.ts), RLS policies.

**Known Fragile Areas:**
- route_stops.stop_id and discovery_content.related_location_id have no foreign key, since they point at either places or businesses. A bad stop_type value or a nonexistent id is not caught by the database.
- A new staff writable table logs nothing until its `log_activity` trigger is attached. The ignore list and the flip map both live inside the one `log_activity()` function.
- RLS update policies guard rows, not columns. Any self-edit form (vendor's business, user's profile) must not submit staff-only or role fields at the app layer.

---
## CURRENT STATE NOTES
---

Facts about the app as it stands today. Not a build log. Add a line here only if it changes how future work should read the codebase; otherwise let the code speak for itself.

- No Switch primitive exists in src/components/ui. Every toggle uses a styled native checkbox. See decision-log.md entry #8.
- No Popover/Command primitive exists. Search dropdowns and similar panels use a plain absolutely-positioned div, matching global-search-bar.tsx.
- Admin lists that support manual reordering (e.g. Landing Page) use up/down icon buttons with optimistic local reorder plus persistence, not a drag library. No drag library is installed anywhere in the app.
- Staff create/edit is a controlled dialog (staff-form-dialog.tsx), not its own route. Places and Businesses keep their own detail pages since both carry a review-history Tabs view Staff has never had.
- auth-layout.tsx and its bundled asset (src/assets/auth-bg.png) no longer exist. Both were deleted once Login and Signup became a short popup with no image panel (landing-hero-plan.md). The gradient exception that lived on that file is retired, see decision-log.md entry #2.
- discover-map.tsx uses maplibre-gl exclusively; leaflet is fully removed. See decision-log.md entry #3. Its symbol layers explicitly set `"text-font": ["Noto Sans Regular"]`, since OpenFreeMap only hosts Noto Sans and the default maplibre-gl font stack 404s against it.
- The map style itself (LATTE, MOCHA, buildStyle, PASIG_CENTER, DEFAULT_ZOOM) lives in map-style.ts, not discover-map.tsx, so location-picker.tsx's map can import the same look. Pure move, no logic change. See decision-log.md entry #21.
- userLocation and the Directions session (route/selectedMode/routeDuration/modeLoading/modeErrorReason/directionsPanelResult, plus the three handlers) are owned by public-shell.tsx (`useUserLocation`/`useDirections`), not discover.tsx, so both survive a tab switch. userLocation comes from a continuous `watchPosition` subscription (one per app session, started/stopped with PublicShell's own mount/unmount), not a single `getCurrentPosition` read. See decision-log.md entry #16.
- Routing goes through `routing.openstreetmap.de` (FOSSGIS), one OSRM instance per mode, selected by a `routed-car`/`routed-bike`/`routed-foot` path prefix. The `/route/v1/{profile}/` segment after that prefix is ignored by every OSRM server and is not validated, so a wrong value there fails silently with a plausible route instead of an error. Never select a graph with it. See decision-log.md entry #15.
- `activity_log` is append only. Session expiry, closed tabs, forced sign out, and failed sign ins are not logged.
- `.dark` in index.css must define every CSS variable `:root` defines; a variable missing from `.dark` silently falls back to the light value even with dark mode active.
- One approved exception to the no-raw-color-value rule: map-style.ts's Catppuccin Latte/Mocha palette, used by both discover-map.tsx and location-picker.tsx (maplibre-gl's StyleSpecification takes literal color strings, not CSS variables). auth-layout.tsx's gradient scrim was the other; it is retired along with the file, see decision-log.md entry #2.
- Coordinates come from the map pin only. Nothing geocodes an address on save; `searchPlaces`/`reverseGeocode` (geocode.ts, Photon's public server) only ever set the pin or suggest an address label, both apply-on-pick. See decision-log.md entry #21.
