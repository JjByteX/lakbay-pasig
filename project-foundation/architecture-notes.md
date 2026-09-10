# architecture-notes.md

---
## AI RULES, READ FULLY BEFORE ANY ACTION
---

1. Read this entire file before proposing any structure, modifying
   any file, or debugging anything.
2. Project scale drives everything. Read the Scale field first.
   Do not propose a structure that exceeds what the scale requires.
3. Before touching any file, identify all files connected to it.
   This map is your reference. If a connection is not listed here,
   find it before proceeding. Do not assume it is isolated.
4. If the structure evolves during the build → update this file.
   An outdated map is worse than no map.
5. Never create folders or layers that the current scale does not
   justify. Do not over-architect small projects. Do not under-
   structure large ones.

---
## SCALE, READ THIS FIRST
---

**Project Scale:**
[x] Medium, multiple features, growing complexity, needs modularity

**Scale Guidelines the AI must follow:**

Small → near-flat structure. Minimal subfolders. Group only what
        genuinely needs grouping. No layers for their own sake.

Medium → feature-based grouping. Each feature owns its files.
         Shared utilities in one place. Clear separation of concerns
         without over-engineering.

Large → fully modular. Domain-driven. Each module is independently
        navigable. Explicit dependency boundaries. Documented entry
        points for every major section.

---
## PROJECT REFERENCE
---

**Project Type:**
Progressive Web App

**Tech Stack:**
- Frontend: React with TypeScript, built with Vite
- UI Components: shadcn/ui with Tailwind CSS
- Backend and Database: Supabase, built on PostgreSQL
- Auth: Supabase Auth, email verification only
- Hosting: Hostinger Node.js hosting, deployed through GitHub integration, connected to Supabase through Hostinger's built in database connector
- Other: role based access through Supabase row level security, matching the Guest, Registered User, Vendor, and CATO Staff roles defined in navigation-and-access-control.md and admin-panel-spec.md

Reasoning: the data model is relational, Places, Trails, Businesses, and Staff permissions all link to each other. PostgreSQL fits this better than a NoSQL database. Supabase adds row level security that maps directly onto the four user roles already defined. shadcn/ui requires TypeScript in its standard setup path, which also adds type safety across the connected data model for a team of three.

**Entry Points:**
What are the main files or modules everything else flows from?
(e.g. main.js, App.tsx, index.py, routes/index.ts)

**Folder Structure:**
Paste or describe the current structure here.
AI: if this is empty at project start → propose a structure based
on the Scale field above, explain each folder's purpose, and wait
for human approval before creating anything.

**Module / Feature Map:**
List the main modules or features and what each one is responsible for.
- Home → recently verified content, CATO announcements, program updates
- Discover → search and map lookup for places and businesses, verification labels shown on every result
- Trails → trail catalog, trail detail with sequenced stops, Discovery content unlock, trail completion and credentials
- Saved → saved places, saved trails, completed trails, earned credentials
- Profile → account info, preferences, vendor mode toggle entry point
- Vendor Mode → business listing creation, listing tiers (Basic, Featured), item and price management, vendor dashboard metrics
- CATO Admin Panel → sidebar sections for Places, Businesses, Events and Announcements, Trails, Staff, each gated by Staff or Admin role
- Auth → Supabase Auth, email verification, role assignment for Guest, Registered User, Vendor, CATO Staff

**Key Dependencies Between Files:**
Which files depend on which? What breaks if X changes?
(This is the map the AI uses before touching anything)
- src/lib/auth-context.tsx → depends on → src/lib/auth-types.ts, supabase/migrations/0001, 0002 (profiles columns)
- Any future admin panel Places section → depends on → places, place_photos, place_reviews (0003)
- Any future admin panel Businesses section → depends on → businesses, business_items, business_reviews, business_flags (0004), business_photos and the profiles_select_staff_business_submitters policy (0008)
- Any future admin panel Trails section → depends on → routes, route_stops, discovery_content (0005)
- Any future admin panel Events section → depends on → events (0006)
- Public Trails tab, Saved tab → depends on → trail_credentials, user_credentials, completed_routes, saved_places, saved_routes (0007)
- route_stops.stop_id and discovery_content.related_location_id → depends on → places.id or businesses.id, no foreign key enforces this, app layer must guarantee stop_type/related_location_type matches a real row

**Database Schema (Build 2, Core Data Models):**

Migrations 0001 to 0007, in `supabase/migrations/`. All tables have row level security enabled, no table grants unauthenticated write access.

| Migration | Tables | Notes |
|---|---|---|
| 0001 | profiles | Base auth extension. role (resident, staff), staff_role (staff, admin) |
| 0002 | profiles (extended) | Adds End User fields and staff fields (position, system_permission) |
| 0003 | places, place_photos, place_reviews | Verification status pending/verified/rejected, review log required per admin-panel-spec.md |
| 0004 | businesses, business_items, business_reviews, business_flags | business_items replaces the single Price Range field. business_flags covers abuse flags and user reports |
| 0005 | routes, route_stops, discovery_content | route_stops and discovery_content use a type-plus-id pattern to reference a place or a business. No foreign key on that column, app layer must enforce it points at a real row |
| 0006 | events | published (draft/live) kept separate from lifecycle_status (upcoming/ongoing/past) |
| 0007 | trail_credentials, user_credentials, completed_routes, saved_places, saved_routes | user_credentials and completed_routes are cohort-stat sources only, never a per-user leaderboard, per competitive-positioning.md |
| 0008 | business_photos (new table), profiles (new select policy) | Adds the photo storage 0004 left out for Businesses, and a profiles read policy scoped to accounts that submitted a business, so a review_businesses reviewer can read created_at. Backs the no-photos and new-account signals in src/lib/business-queue-priority.ts |
| 0009 | profiles (function only) | Adds public.is_admin(), a security definer function. profiles_select_admin and profiles_update_admin now call it instead of subquerying profiles inline, removing a self-referencing RLS recursion |
| 0014 | place_reviews | Widens place_id to reviewed_type/reviewed_id, so the same review log table covers both place and discovery_content reviews |
| 0015 | businesses | businesses_select_public widened from verified to verified or pending |
| 0016 | business_items | business_items_select_public widened to match 0015, verified or pending on the parent business |
| 0017 | places, businesses | Adds verified_at, nullable, set only on the transition into verified. Backfilled from updated_at for rows already verified at migration time |

RLS pattern used throughout: a `_select_public` policy with no `to` clause (defaults to public, covers Guest with no sign-in) gated on a status column (verified, published, active), a `_select_staff` and `_write_staff` pair checking `staff_role = 'admin' or '<permission>' = any(system_permission)`, and for owner-writable tables (businesses, saved_*, user_credentials, completed_routes) a `using (auth.uid() = <owner column>)` policy. Column-level protection (e.g. a vendor must not send verification_status in their own update) is not enforced by RLS, same limitation documented in migration 0001, the app layer must not send staff-only fields in a self-update request.

Fields present in docs/data-model.md but intentionally left out of the schema, since they are derivable from a join table instead of stored directly: places.Trails Included In, businesses.Trails Included In, routes.Places Included and Place Order (both live in route_stops), trail_credentials.Users Earned. Recomputing these from route_stops and user_credentials avoids duplicated data going stale.

**What Must Never Be Touched Without Human Approval:**
Database schema (supabase/migrations/*.sql), auth logic (src/lib/auth-context.tsx, auth-types.ts), RLS policies.

**Known Fragile Areas:**
- route_stops.stop_id and discovery_content.related_location_id have no foreign key, since they point at either places or businesses. A bad stop_type value or an id that doesn't exist in the matching table will not be caught by the database.
- RLS update policies guard rows, not columns. Any form that lets a vendor edit their own business, or a user edit their own profile, must not submit staff-only or role fields, the database will not block it if the row is otherwise theirs.

---
## STRUCTURE CHANGE LOG
---
AI: when the structure changes during the build, log it here.

| Date | Change | Reason |
|------|--------|--------|
| Build 2 | Added profiles.position, profiles.system_permission | Required before any staff-gated table can check permissions |
| Build 2 | Added routes.status (draft/published) | admin-panel-spec.md implies a build-then-publish flow with no second reviewer |
| Build 2 | Added events.published, separate from lifecycle_status | admin-panel-spec.md treats create, edit, and publish as distinct actions, separate from Upcoming/Ongoing/Past |
| Build 2 | Added discovery_content.needs_place_review | Flags new historical claims in Discovery content for the Places review queue, per admin-panel-spec.md |
| Build 3, Phase 6.1 | Added business_photos (0008) | data-model.md's Pictures field for Local Business had no table. Needed for the no-photos review queue signal in vendor-mode-spec.md |
| Build 3, Phase 6.1 | Added profiles_select_staff_business_submitters policy (0008) | A review_businesses staff member had no way to read a vendor's created_at, needed for the new-account review queue signal. Scoped to profiles that submitted a business |
| 0009 | Added public.is_admin(), replaced profiles_select_admin and profiles_update_admin's inline subqueries with a call to it | The inline subquery re-entered RLS on profiles and caused the login read to hang once an account's staff_role was set to admin |
| Phase 5.3 | Added admin-discovery-content-review.tsx and /admin/places/discovery/:id, gated on manage_places | admin-place-detail.tsx is the Place edit form, its fields don't fit a discovery_content row. admin-places.tsx now merges places and flagged discovery_content into one queue with a Type column |
| Phase 5.3 | Reject on a discovery_content row is log-only, no longer sets status to inactive | Auto-unpublishing silently pulled a stop out of a live sequence with no review UI showing the impact. The Trail Publishing exception gates publish, not content already live |
| Phase 5.4 | admin-trails.tsx's publish gate now also blocks on any linked discovery_content with needs_place_review = true, beyond the existing stop_count = 0 check. admin-trail-builder.tsx's Review and Publish step shows a trail-wide summary and a publish/unpublish control | admin-panel-spec.md's Trail Publishing exception gates publish on unresolved flagged content. Publish is disabled up front, per ux-ui-guidelines.md's Disabled/gated rule |
| Pre-5.4 fix | admin-trail-builder.tsx's persistStops rewritten from delete and reinsert to in-place update, matched by route_stops.id | Delete and reinsert changed route_stops.id on every edit, nulling discovery_content.related_route_stop_id for any content already attached |
| Phase 6.1 | admin-dashboard.tsx's Places pending count sums places pending with discovery_content.needs_place_review = true. No Events or Trails card added | Events has no pending concept, both published and lifecycle_status are staff-controlled with no second reviewer. Flagged Trail content folds into the Places number, per step-4-phases.md |
| Post-6.1 fix | admin-dashboard.tsx's Recent activity feed now queries place_reviews once per reviewed_type and labels each set correctly | The prior unfiltered query mislabeled discovery_content reviews as place reviews after migration 0014 widened the table |
| Read-through fix | admin-events.tsx's row action dropdown gained Publish/Unpublish and a Set status submenu, matching admin-trails.tsx's row-action shape | admin-event-detail.tsx already had both controls, the list row only had Edit |
| Read-through fix | admin-event-detail.tsx's Publish button is disabled with an inline reason when title, description, category, or date_time are blank | Matches admin-trail-builder.tsx's gate shape. Known gap: the gate reads live form state, not the last saved row |
| Read-through fix | admin-trail-builder.tsx's persistStops re-verifies each picked stop's id against places or businesses immediately before insert | place-business-picker.tsx's list can go stale while its modal stays open. No foreign key covers route_stops.stop_id |
| Step 5 | Widened businesses_select_public (0015) and business_items_select_public (0016) to verified or pending. Added the public shell and five bottom-nav routes. Built the combined Discover data layer, the map/list screen with search, category, and price filters, the shared result card, and the place/business detail pages. Added the save action. Installed leaflet and react-leaflet | Full step-5-plan.md and step-5-phases.md build, summarized as one row. Manual walkthroughs across guest, save, and verification-label states were not run this session |
| Step 5, Phase 2 | Added public-shell.tsx and bottom-nav.tsx, stub pages for Trails, Discover, Saved, Profile. home.tsx now renders as a shell child instead of owning the root route | ux-ui-guidelines.md's Layout Shell Rules place top bar and bottom nav in the shell, not the page |
| Step 5, Phase 3 | Added discover-types.ts and discover-query.ts | Queries places (verified only) and businesses (verified or pending) separately, merged into one typed list. sortDiscoverResults uses straight-line distance, sufficient for a list sort |
| Step 5, Phase 4.1-4.2 | Added discover-map.tsx, centered on Pasig with geolocation recentering. public-shell.tsx's main region changed to a fixed, sized area so a full-bleed map has a height to fill | Denied or unavailable geolocation keeps the Pasig default, no error state, since it's a fallback not a required permission |
| Step 5, Phase 4.3-4.4 | Added result-card.tsx. discover-map.tsx renders one marker per result with coordinates, two treatments for verified and pending, opening the result card on tap | Marker dots use divIcon with existing Tailwind classes instead of new image assets |
| Step 5, Phase 5 | Moved the combined query, geolocation, and userLocation state up into discover.tsx. Added discover-list.tsx and a map/list Tabs toggle. Search and category filter now narrow one result set feeding both surfaces | Lifting state avoids a second fetch and geolocation call that could desync from the map |
| Step 5, Phase 6 | result-card.tsx's modal now links to the full detail page. Migration 0016 widens business_items_select_public to match 0015 | The link was imported but unused. A pending business's item list returned zero rows under RLS with no widen on the child table |
| Step 5, Phase 7 | Added itemPrices to DiscoverBusiness, a price range filter on discover.tsx narrowing businesses with at least one item in range | An item with no price is skipped by this filter only, never hidden elsewhere, per vendor-mode-spec.md |
| Step 5, Phase 8.1 | Added resultsLoading state, skeleton rows in discover-list.tsx, and a tile-load pill in discover-map.tsx | Map tiles loading, result query in flight, and detail page loading needed to read as distinct from empty, not one shared spinner |
| Step 5, Phase 8.2 | Added an empty-result pill to discover-map.tsx, matching discover-list.tsx's existing copy | An empty filtered set previously showed a bare map with no message |
| Step 5, Phase 8.3 | Added resultsError state, checked first in both discover-list.tsx and discover-map.tsx, text-destructive. save-button.tsx gained a direction-aware error message on save or unsave failure | Query failures need specific messages, not a silent empty result |
| Step 5, Phase 8.4 | Fixed three overflow cases at a 320px viewport: the category Select's fixed width, the business item-list row's untruncated name, and the map's status pills with no width constraint | Confirm-and-check pass across every file this step touched |
| Step 5, Phase 8.5 | Changed the map/list Tabs toggle gap from 6px to 4px, matching bottom-nav.tsx | Token audit across every new Discover file. No other raw value found |
| Post-8.1 fix | discover-map.tsx's tile-load listener now also calls map.whenReady | Leaflet's load event fires once and does not replay to a listener attached after it already fired, which could leave the pill stuck |
| Step 6, Phases 1-5 | Confirmed on read-through: migration 0017 (verified_at, nullable, backfilled from updated_at), admin-place-detail.tsx and admin-business-detail.tsx setting it only on the verify transition, home-types.ts, home-query.ts, announcement-card.tsx, verified-item-card.tsx, event-detail.tsx, and the events/:id route | All present and correct against step-6-phases.md before Phase 6 began |
| Step 6, Phase 6 | home.tsx: added per-section error state set from each fetch's catch, three-row skeleton loading, and a distinct empty-state line per section. Render order is error, then loading, then empty, then loaded | Matches discover-list.tsx's established state order. event-detail.tsx already matched discover-place-detail.tsx's loading/not-found pattern, no change needed |
| Auth visual pass | Added src/assets/ (new folder, first image asset in the repo) and src/components/auth/auth-layout.tsx, a shared split-screen shell (image panel + form panel) wrapping login.tsx and signup.tsx, including signup's "Check your email" success state. login.tsx and signup.tsx's raw `<input>`/`<label>`/`<button>` elements swapped for the existing, previously-unused shadcn Input, Label, and Button components | User supplied a CATO plaza illustration and an inspiration screenshot (split-panel auth screen) and asked for it applied across "the authentication parts," not just login. One shared layout avoids duplicating the panel across both screens. The asset was resized 1671×941→1200×675 and converted PNG→JPEG (~1.9MB→~189KB) since it has no transparency |
| Logo / PWA icons | Added src/assets/lakbay-pasig-logo.svg (squircle-masked logo, self-contained with the source art base64-embedded), and public/ (new top-level folder: favicon.ico, icons/icon-192.png, icons/icon-512.png, icons/maskable-192.png, icons/maskable-512.png, manifest.json). index.html now links favicon, apple-touch-icon, and points rel="manifest" at a file that actually exists. auth-layout.tsx renders the logo above the form panel | index.html referenced /manifest.json since before this session but the file never existed in the repo, a pre-existing gap fixed as part of wiring the logo in. Icon art is padded to ~82% scale inside its square canvas before squircle-clipping so the wordmark clears the corner curvature (verified by rendering the raw superellipse crop first, which clipped into "LAKBAY" at 100% scale). "maskable" manifest entries point at the unclipped square padded art, not the pre-clipped squircle PNGs, since the OS applies its own mask on top and double-clipping would cut the badge a second time — confirmed by simulating a circular Android mask over both variants |

---
