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
- Public Trails tab, Saved tab → depends on → trail_credentials, user_credentials, completed_routes, saved_places, saved_routes (0007), route_progress (0018)
- src/lib/saved-routes.ts, src/lib/trail-completion.ts → depend on → src/lib/trail-query.ts's exported fetchCredentialNamesByRouteId (Step 8, Phase 1), same lookup fetchPublishedTrails uses internally
- src/lib/vendor-status.ts → depends on → businesses (0004), specifically businesses_select_own
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
| 0018 | route_progress (new table) | One row per user per route, highest_unlocked_stop_id references route_stops(id). Backs mid-trail resume for the Public Trails tab (step 7), fills the gap step-7-trail-plan.md flagged: completed_routes is write-once-at-finish, nothing tracked in-progress position before this |

RLS pattern used throughout: a `_select_public` policy with no `to` clause (defaults to public, covers Guest with no sign-in) gated on a status column (verified, published, active), a `_select_staff` and `_write_staff` pair checking `staff_role = 'admin' or '<permission>' = any(system_permission)`, and for owner-writable tables (businesses, saved_*, user_credentials, completed_routes, route_progress) a `using (auth.uid() = <owner column>)` policy. Column-level protection (e.g. a vendor must not send verification_status in their own update) is not enforced by RLS, same limitation documented in migration 0001, the app layer must not send staff-only fields in a self-update request.

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
| Build 2 | Added discovery_content.needs_place_review | Flags new historical claims in Discovery content for the Places review queue |
| Build 3, Phase 6.1 | Added business_photos (0008) | data-model.md's Pictures field for Local Business had no table. Backs the no-photos review queue signal in vendor-mode-spec.md |
| Build 3, Phase 6.1 | Added profiles_select_staff_business_submitters policy (0008) | Lets a review_businesses staff member read a vendor's created_at, for the new-account queue signal |
| 0009 | Added public.is_admin(), replaced profiles_select_admin and profiles_update_admin's inline subqueries with a call to it | The inline subquery re-entered RLS on profiles and hung the login read once staff_role was set to admin |
| Phase 5.3 | Added admin-discovery-content-review.tsx and /admin/places/discovery/:id, gated on manage_places. admin-places.tsx merges places and flagged discovery_content into one queue with a Type column | admin-place-detail.tsx's fields don't fit a discovery_content row |
| Phase 5.3 | Reject on a discovery_content row is log-only, no longer sets status to inactive | Auto-unpublishing silently pulled a stop out of a live sequence with no review UI showing the impact |
| Phase 5.4 | admin-trails.tsx's publish gate also blocks on any linked discovery_content with needs_place_review = true, beyond the existing stop_count = 0 check. admin-trail-builder.tsx's Review and Publish step shows a trail-wide summary and a publish/unpublish control | admin-panel-spec.md's Trail Publishing exception gates publish on unresolved flagged content |
| Pre-5.4 fix | admin-trail-builder.tsx's persistStops rewritten from delete-and-reinsert to in-place update, matched by route_stops.id | Delete and reinsert changed route_stops.id on every edit, nulling discovery_content.related_route_stop_id for any content already attached |
| Phase 6.1 | admin-dashboard.tsx's Places pending count sums places pending with discovery_content.needs_place_review = true. No Events or Trails card added | Events has no pending concept, both fields are staff-controlled with no second reviewer. Flagged Trail content folds into the Places number |
| Post-6.1 fix | admin-dashboard.tsx's Recent activity feed now queries place_reviews once per reviewed_type and labels each set correctly | The prior unfiltered query mislabeled discovery_content reviews as place reviews after migration 0014 widened the table |
| Read-through fix | admin-events.tsx's row action dropdown gained Publish/Unpublish and a Set status submenu, matching admin-trails.tsx | admin-event-detail.tsx already had both controls, the list row only had Edit |
| Read-through fix | admin-event-detail.tsx's Publish button is disabled with an inline reason when title, description, category, or date_time are blank | Matches admin-trail-builder.tsx's gate shape. Known gap: the gate reads live form state, not the last saved row |
| Read-through fix | admin-trail-builder.tsx's persistStops re-verifies each picked stop's id against places or businesses immediately before insert | place-business-picker.tsx's list can go stale while its modal stays open. No foreign key covers route_stops.stop_id |
| Step 5 | Widened businesses_select_public (0015) and business_items_select_public (0016) to verified or pending. Added the public shell and five bottom-nav routes. Built the combined Discover data layer, the map/list screen with search, category, and price filters, the shared result card, and the place/business detail pages. Added the save action. Installed leaflet and react-leaflet | Full step-5 build, summarized as one row. Manual walkthroughs across guest, save, and verification-label states were not run this session |
| Step 5, Phase 2 | Added public-shell.tsx and bottom-nav.tsx, stub pages for Trails, Discover, Saved, Profile. home.tsx now renders as a shell child instead of owning the root route | ux-ui-guidelines.md places top bar and bottom nav in the shell, not the page |
| Step 5, Phase 3 | Added discover-types.ts and discover-query.ts | Queries places (verified only) and businesses (verified or pending) separately, merged into one typed list. sortDiscoverResults uses straight-line distance |
| Step 5, Phase 4.1-4.2 | Added discover-map.tsx, centered on Pasig with geolocation recentering. public-shell.tsx's main region is now a fixed, sized area so a full-bleed map has a height to fill | Denied or unavailable geolocation keeps the Pasig default, no error state, it's a fallback not a required permission |
| Step 5, Phase 4.3-4.4 | Added result-card.tsx. discover-map.tsx renders one marker per result with coordinates, two treatments for verified and pending, opening the result card on tap | Marker dots use divIcon with existing Tailwind classes, no new image assets |
| Step 5, Phase 5 | Moved the combined query, geolocation, and userLocation state up into discover.tsx. Added discover-list.tsx and a map/list Tabs toggle. Search and category filter now narrow one result set feeding both surfaces | Lifting state avoids a second fetch and geolocation call that could desync from the map |
| Step 5, Phase 6 | result-card.tsx's modal now links to the full detail page. Migration 0016 widens business_items_select_public to match 0015 | The link was imported but unused. A pending business's item list returned zero rows under RLS with no widen on the child table |
| Step 5, Phase 7 | Added itemPrices to DiscoverBusiness, a price range filter on discover.tsx narrowing businesses with at least one item in range | An item with no price is skipped by this filter only, never hidden elsewhere |
| Step 5, Phase 8.1 | Added resultsLoading state, skeleton rows in discover-list.tsx, and a tile-load pill in discover-map.tsx | Map tiles loading, result query in flight, and detail page loading needed to read as distinct from empty, not one shared spinner |
| Step 5, Phase 8.2 | Added an empty-result pill to discover-map.tsx, matching discover-list.tsx's existing copy | An empty filtered set previously showed a bare map with no message |
| Step 5, Phase 8.3 | Added resultsError state, checked first in both discover-list.tsx and discover-map.tsx, text-destructive. save-button.tsx gained a direction-aware error message on save or unsave failure | Query failures need specific messages, not a silent empty result |
| Step 5, Phase 8.4 | Fixed three overflow cases at a 320px viewport: the category Select's fixed width, the business item-list row's untruncated name, and the map's status pills with no width constraint | 320px viewport pass across every file this step touched |
| Step 5, Phase 8.5 | Changed the map/list Tabs toggle gap from 6px to 4px, matching bottom-nav.tsx | Token audit found one raw value |
| Post-8.1 fix | discover-map.tsx's tile-load listener now also calls map.whenReady | Leaflet's load event fires once and doesn't replay to a listener attached after it already fired, which could leave the pill stuck |
| Step 6, Phases 1-5 | Confirmed on read-through: migration 0017 (verified_at, nullable, backfilled from updated_at), admin-place-detail.tsx and admin-business-detail.tsx setting it only on the verify transition, home-types.ts, home-query.ts, announcement-card.tsx, verified-item-card.tsx, event-detail.tsx, and the events/:id route | All present and correct before Phase 6 began |
| Step 6, Phase 6 | home.tsx: added per-section error state set from each fetch's catch, three-row skeleton loading, and a distinct empty-state line per section. Render order is error, loading, empty, loaded | Matches discover-list.tsx's state order. event-detail.tsx already matched discover-place-detail.tsx's pattern |
| Auth visual pass | Added src/assets/ and src/components/auth/auth-layout.tsx, a shared split-screen shell (image panel + form panel) wrapping login.tsx and signup.tsx, including signup's "Check your email" state. login.tsx and signup.tsx's raw input/label/button elements swapped for shadcn Input, Label, and Button | User supplied a CATO plaza illustration and a split-panel inspiration screenshot for all auth screens. One shared layout avoids duplicating the panel. Asset resized 1671x941 to 1200x675 and converted PNG to JPEG (1.9MB to 189KB), no transparency needed |
| Logo / PWA icons | Added src/assets/lakbay-pasig-logo.svg and public/ (favicon.ico, icons/icon-192.png, icons/icon-512.png, icons/maskable-192.png, icons/maskable-512.png, manifest.json). index.html now links favicon, apple-touch-icon, and a manifest that actually exists. auth-layout.tsx renders the logo above the form panel | index.html referenced /manifest.json before this session but the file never existed. Icon art is padded to ~82% scale before squircle-clipping so the wordmark clears the corner curvature. Maskable manifest entries point at the unclipped square art since the OS applies its own mask |
| Step 7, Phase 0 | Added migration 0018 (route_progress: one row per user per route, highest_unlocked_stop_id references route_stops, owner-only RLS matching saved_places_own) | completed_routes (0007) is write-once-at-finish; nothing tracked mid-trail position, so closing the app mid-walk had no way to resume. Human-confirmed, logged as decision-log.md entry #3 |
| Step 7, Phase 0 | Removed leaflet, react-leaflet, @types/leaflet from package.json. Dropped the leaflet.css import from main.tsx. Updated discover-map.tsx's leaflet comment to historical context | discover-map.tsx has used maplibre-gl exclusively since the vector restyle; only a stale comment and main.tsx still referenced leaflet. package-lock.json left untouched, no install run this session |
| Step 7, Phase 1 | Added src/lib/trail-types.ts (TrailSummary, TrailStop, TrailDiscoveryContent, TrailCredential, TrailDetail), trail-query.ts (fetchPublishedTrails, fetchTrailDetail), trail-progress.ts (getRouteProgress, unlockStop, resetRouteProgress), saved-routes.ts (isRouteSaved, toggleSavedRoute) | Data layer only, no UI yet. trail-query.ts's stop-name resolve mirrors admin-trail-builder.tsx's loadStops (route_stops.stop_id has no foreign key). saved-routes.ts mirrors saved-places.ts with place_id swapped for route_id. discovery_content select excludes needs_place_review, a staff-only field |
| Step 7, Phase 2 | Added src/components/public/trail-card.tsx. trails.tsx and the trails/:id route were already present in this checkout | Trail catalog page. trail-card.tsx's row shows name, theme, duration, and budget on one metadata line, same two-line shape as verified-item-card.tsx and announcement-card.tsx. Note: App.tsx already imports trail-detail.tsx, which doesn't exist yet, that page is Phase 3's scope |
| Step 7, Phase 3 | Added src/pages/trail-detail.tsx, filling the trails/:id route. Fetches via fetchTrailDetail keyed by useParams().id, same error/loading/not-found/loaded order and back button as discover-place-detail.tsx and event-detail.tsx | Guest preview only, per navigation-and-access-control.md. Header joins theme/duration/budget/run_type on one meta line, no verification badge since publish itself is the trust signal. Stop list is a numbered list, name only, no lock/unlock state yet. Start button only implements the signed-out branch (navigates to /login); the signed-in branch (route_progress creation/resume) is Phase 4.3's scope |
| Step 7, Phase 4.1 | Added src/components/public/trail-stop.tsx (TrailStop component, TrailStopState: "locked" \| "unlocked" \| "completed") | One stop's render across its three states in a single component. Row shape reuses trail-detail.tsx's existing list-item shape. Locked: name only, muted, Lock icon, no Discovery content. Unlocked and completed render stop.discoveryContent when present; completed also shows a CheckCircle2 mark. Component only, wiring it into trail-detail.tsx is Phase 4.2-4.3 |
| Step 7, Phase 4.2 | trail-detail.tsx: added an effect that loads the signed-in user's route_progress row (getRouteProgress) once the trail resolves, storing highestUnlockedStopId in new routeProgress state | Data load only, matches save-button.tsx's isPlaceSaved effect shape (signed-in-only, fetch failure falls back to empty). Swapping the stop list for trail-stop.tsx's three-state render stays Phase 4.3. routeProgress needed a real consumer for noUnusedLocals, so the stop row gained an inert "Last reached" marker, no interaction yet |
| Step 7, Phase 4.5 | trail-query.ts's TrailStop gained latitude/longitude (same select, no second round trip). trail-detail.tsx added a GPS-watch effect and an unlock-check effect comparing the watched position against the next locked stop's coordinate via distanceKm, calling unlockStop when inside discoveryContent.unlock_radius | Only the single next-in-sequence locked stop is checked per tick, a trail is a sequence not a set. A stop with no coordinate or no discoveryContent row is skipped, not guessed in or out of range |
| Post-Phase-4.5 fix | discover-query.ts's distanceKm changed from a local unexported function to `export function distanceKm` | trail-detail.tsx's unlock check imports distanceKm from discover-query.ts, but it was never exported, a build-breaking TS2459 caught by tsc --noEmit. Fixed at the shared function, no second haversine implementation. No other caller affected |
| Step 7, Phase 4.6 | No code change, confirm-and-check pass | Traced every path that can call unlockStop: only handleStart (first stop, no existing routeProgress row) and the proximity effect (next locked stop, GPS-gated). No onClick, button, or link exists on any stop row; the locked state renders name and Lock icon only. Nothing to fix |
| Step 7, Phase 4.7 | Added src/components/public/save-route-button.tsx, wired into trail-detail.tsx's header next to the back button, matching discover-place-detail.tsx's SaveButton placement | Reuses save-button.tsx's heart-icon pattern, wired to saved-routes.ts instead of saved-places.ts. save-button.tsx stays place-only (no saved_businesses table), so a sibling component was added rather than generalizing it. Same signed-out behavior: navigates to /login, never a disabled heart |
| Post-Phase-4.7 fix | discover-map.tsx's LATTE palette object lost its `as const` assertion | CI failed with 13x TS2322 on MOCHA's declaration (`const MOCHA: typeof LATTE = {...}`). `as const` had frozen LATTE's properties to their own literal types, so typeof LATTE demanded MOCHA match key-for-key. Neither object is read anywhere but buildStyle's palette parameter, which only consumes plain color strings, so no caller relied on the narrowed type. Fixed by dropping `as const` |
| Step 7, Phase 5 | Added src/lib/trail-completion.ts (isRouteCompleted, completeTrail). trail-detail.tsx: added completed/completing/completeError state (loaded via isRouteCompleted on mount, signed-in only); a shared maybeCompleteTrail(unlockedStopId) helper called from both the proximity-unlock effect and handleStart's first-stop branch, covering the one-stop-trail edge case, guarded on !completed to prevent double-insert; completeTrail inserts completed_routes then user_credentials if trail.credential exists; the "Earn: {name}" badge relabels to "Earned: {name}" once completed, plus a "Trail completed" fallback line when there's no linked credential, and a "Saving your completion..." line while in flight; added resetting/resetError state and handleRestart, which calls resetRouteProgress and locally resets completed to false, leaving the completed_routes row untouched since it's a completion log, not current progress. A "Restart trail" button appears beneath Start/Resume once completed | Completion and credential flow, no schema change needed (completed_routes and user_credentials already existed with owner-writable RLS). Deliberately skipped a cohort completion-count display, not required this phase. Repo-wide grep confirmed trail-detail.tsx is the only caller of these functions and the only other file referencing completed_routes or user_credentials |
| Step 7, Phase 6.1 | No code change, confirm-and-check pass | Re-verified error-before-loading-before-empty-before-loaded ordering and text-destructive convention across trails.tsx, trail-detail.tsx, and the action-level errors (completeError, startError, resetError, save-route-button.tsx). All consistent, nothing to fix |
| Step 7, Phase 6.2 | Fixed trails.tsx's TrailListSkeleton: dropped from three Skeleton lines per row to two, gap-1 instead of gap-2 | The skeleton was copied from discover-list.tsx's 3-line loading state, but trail-card.tsx's real row only has two lines (a trail carries no verification badge). Detail page's loading line already matched discover-place-detail.tsx, no change needed there |
| Step 7, Phase 6.3 | No code change, confirm-and-check pass | Re-verified trails.tsx's empty state ("No published trails yet.") is a single line, distinct wording from discover's and home's empty states, and from admin-trails.tsx's "No trails yet." (different concept, different surface). Nothing to fix |
| Step 7, Phase 6.4 | No code change, re-confirm pass | Re-checked trail-stop.tsx's locked branch has no onClick/button/link, and that the stop list sits inside a page-level block mutually exclusive with the error and loading blocks. A locked stop can't render through either. Phase 5's completed-state markup uses text-foreground, unrelated to the error/empty styling. Nothing to fix |
| Step 7, Phase 6.5 | Fixed one 320px overflow risk: trail-detail.tsx's credential badge (`w-fit`, no width cap) could push wider than its container for a long credential_name. Added max-w-full break-words | Token audit at 320px viewport across every Step 7 file. Trail card row, stop list, and discovery-content text were already 320px-safe by design. Credential badge was the one genuine risk since credential_name has no length cap; fixed with the same max-w-full break-words pattern discover-map.tsx's status pills already use. No other raw values found |

| Admin sidebar: logo + font sizes | Added the logo (lakbay-pasig-logo.svg) to admin-sidebar.tsx's header, always visible even when collapsed, using the same collapse-persistent pattern as the footer's Avatar. Bumped sidebar font sizes one step up the existing type scale: header/footer name text-sm to text-base, footer role text-xs to text-sm, nav item text text-sm to text-base with row height h-8 to h-9 | Requested directly. text-base was unused in admin but already established across the public surface, so this is reuse not invention. Nav text changed at the primitive level (sidebarMenuButtonVariants) since admin-sidebar.tsx is its only consumer. sm and lg size variants left untouched, no usage to check against |
| Admin sidebar: logo clipping fix | Fixed the logo clipping during the sidebar collapse/expand transition by adding `group-data-[collapsible=icon]:!p-0` to the logo row and sizing the image down to h-6 w-6 | Reported directly. Root cause: the row's own padding stacked on top of SidebarHeader's padding, leaving only 16px of the collapsed rail for a 32px image, so it fought the shrinking container during the transition. Nav buttons already solve this with collapse-aware sizing; the header row didn't. Flagged, not fixed: the footer's Avatar has the same underlying math and is a latent risk of the same bug, just less visible, left untouched since it wasn't reported broken |
| Step 8, Phase 0 | auth-context.tsx: removed a leftover `console.log("DEBUG fetchProfile"...)`. Added `refreshProfile` to AuthContextValue, calling the existing private fetchProfile and updating state, no-op when signed out | Profile page's own save action (Phase 4) needs a way to push a fresh profiles row back into context without waiting for the next full session load. No new file, one function added to the existing context, per ponytail's reuse-before-writing ladder |
| Step 8, Phase 1 | Added src/lib/vendor-status.ts (getVendorBusiness). trail-query.ts's fetchCredentialNamesByRouteId changed from module-private to exported. saved-places.ts gained fetchSavedPlaces (returns DiscoverPlace[]). saved-routes.ts gained fetchSavedRoutes (returns TrailSummary[], imports fetchCredentialNamesByRouteId). trail-completion.ts gained fetchCompletedRoutes (returns TrailSummary & completed_at, imports fetchCredentialNamesByRouteId), file header comment updated to explain why this read doesn't reopen the no-cohort-query stance the file was written with | Data layer only, no UI yet, per constraints.md's Automation First rule. All three list fetches follow the same two-step shape (owner-scoped join-table select, then the target table's display fields, merged client side) fetchPublishedTrails already established. VerifiedItemCard was checked against fetchSavedPlaces's shape and found to require a verified_at field a saved place has no reason to carry; resolved by keeping fetchSavedPlaces on DiscoverPlace and adding a small saved-place-row.tsx in Phase 3 rather than loosening VerifiedItemCard's prop type or borrowing places.verified_at for an unrelated meaning |
| Step 8, Phase 2 | saved.tsx and profile.tsx: replaced the step-8 stub with a guest-locked branch (loading guard, then a signed-out message plus a Button asChild + Link "Sign in" to /login, then a still-stubbed signed-in placeholder for Phase 3/4) | Neither route carries a ProtectedRoute, per App.tsx and navigation-and-access-control.md's Guest column ("locked, prompt to sign in," not redirected elsewhere), so each page owns its own check rather than reusing protected-route.tsx's redirect-away behavior. Link-based sign in (not navigate() in a click handler) since the button's only purpose is going to /login, matching home.tsx's own Log in button and signup.tsx's sign-in links; Button asChild + Link reuses result-card.tsx's already-established composition for this pairing |
| Step 8, Phase 3 | saved.tsx: filled in the three loaded sections (Saved Places, Saved Trails, Completed Trails), each with its own independent loading/error/empty state, same per-section pattern home.tsx and trails.tsx already use. Added three new row components: saved-place-row.tsx (VerificationBadge reused from result-card.tsx, not verified-item-card.tsx -- that component's RecentlyVerifiedItem prop type requires verified_at, which fetchSavedPlaces's DiscoverPlace return type has no reason to carry, per this file's own Step 8 Phase 1 entry below), saved-trail-row.tsx (wraps trail-card.tsx, doesn't modify it), and completed-trail-row.tsx (also wraps trail-card.tsx, adds a completed date and an "Earned: {name}" line copied verbatim from trail-detail.tsx's own completed-state badge). save-button.tsx and save-route-button.tsx each gained one new optional prop, onToggle?: (saved: boolean) => void, fired only after their respective toggle call resolves successfully, not on the optimistic flip -- both existing call sites (discover-place-detail.tsx, trail-detail.tsx) pass none and are unchanged | A `<button>` cannot contain another interactive button, so a row that needs both a tap-to-navigate area and a heart control (step-8-plan.md: "Saved is not read only") can't nest the heart inside trail-card.tsx's or a bare button's existing single-button shape. Resolved with sibling composition (tap target + heart as flex siblings), the same pattern discover-place-detail.tsx and trail-detail.tsx already use for a back button next to SaveButton/SaveRouteButton in a page header, applied here at row level. onToggle is how each row removes itself from the Saved page's list the instant it's unsaved, since neither heart component had any way to inform a parent list of a successful toggle before this addition |
| Step 8, Phase 4 | profile.tsx: replaced the Phase 2.2 stub's signed-in placeholder with the loaded state. Account info (display_name, contact_number, date_of_birth, preferred_language, preferred_categories) seeded from useAuth()'s profile on load/refresh, email from session.user.email (profiles has no email column). All fields editable inline, no separate edit route. Save writes an explicit allow-list payload, not the form state spread wholesale, then calls Phase 0.8's refreshProfile so context and the page both reflect the write immediately. Vendor entry point calls getVendorBusiness (Phase 1): a row renders a "Managing {name}" Link to /vendor, no row renders nothing. Sign out control (Button, variant secondary) added here using the same signOut from AuthContext home.tsx currently calls -- home.tsx's own Log out/Log in block is untouched, that removal is Phase 5's scope, not this one | CATEGORIES and LANGUAGES reused as-is from admin-place-detail.tsx's own constants (Heritage Site/Museum/Monument/Church/Cultural Site; English/Filipino/Both), not redefined, per constraints.md's Inventory Before Suggesting rule -- same multi-select Button-toggle pattern that file already uses for facilities, and the same Select pattern it already uses for language. date_of_birth uses a native `<input type="date">` (Input component), no picker dependency, per ponytail's native-platform-feature rung. /vendor is a link destination only, no route added to App.tsx -- vendor mode's own screens are step 9's scope, this link's destination doesn't need to resolve yet |
| Step 8, Phase 5 | home.tsx: removed the Log out/Log in block (former lines 144-158) along with the useAuth import and session/signOut destructure it was the only consumer of, dropped for noUnusedLocals (tsconfig.app.json). Announcements and Recently verified sections are unconditional on auth state, so both branches render identically to before minus the removed block | Duplicated a control Profile now owns (Phase 4.6), per ux-ui-guidelines.md's one label, one place rule. public-shell.tsx and bottom-nav.tsx confirmed untouched, neither had any auth control to begin with, this was a page-level removal only |
| Step 8, Phase 6.2 | saved.tsx: split the single shared two-line SectionSkeleton into TwoLineSectionSkeleton (Saved Trails, Completed Trails) and ThreeLineSectionSkeleton (Saved Places) | The shared skeleton was two lines everywhere, matching trail-card.tsx's shape, but SavedPlaceRow renders name/category/VerificationBadge, the same three-line shape as verified-item-card.tsx's row, which home.tsx's own SectionSkeleton already gives three lines for. Saved Places' loading state was silently under-representing its real row before this fix, caught on Phase 6.2's own re-check pass (skeleton line count vs each row's actual shape) |
| Step 8, Phase 6.5 | profile.tsx: vendor entry Link's Store icon gained shrink-0, "Managing {name}" text moved into a `<span className="min-w-0 break-words">` | businesses.name (migration 0004) has no length cap, the same unbounded-text risk trail-detail.tsx's credential badge already had before Step 7 Phase 6.5's own max-w-full break-words fix. The vendor link had no equivalent guard, a long business name could overflow the row's border/padding at a 320px viewport, caught on this phase's own 320px pass across every Step 8 row |
| Step 8, Phase 6 | Re-confirmed (no code change): 6.1 error/loading/empty/loaded ordering on both pages, 6.3 empty-string wording distinctness across all three Saved sections, 6.4 interaction boundaries (no stray tap target on either guest view, no nested cards anywhere in Step 8's files), 6.6 token audit (no raw color/spacing/radius value in any Step 8 file, all spacing classes on the 8px grid or the 4px gap exception), 6.7 no duplicate sign in/out control across Home, Saved, and Profile (Home has none post-Phase-5, Saved and Profile each own exactly one) | Full pass per step-8-phases.md's Phase 6, same closing shape Step 7's own Phase 6.1-6.5 used. Two real findings surfaced and fixed, logged in the two rows directly above; everything else checked clean |

---
