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
| 0004 | businesses, business_items, business_reviews, business_flags | business_items replaces the single Price Range field. business_flags covers both abuse flags and user reports |
| 0005 | routes, route_stops, discovery_content | route_stops and discovery_content use a type-plus-id pattern to reference either a place or a business, no foreign key on that column, app layer must enforce it points at a real row |
| 0006 | events | published (draft/live) kept separate from lifecycle_status (upcoming/ongoing/past) |
| 0007 | trail_credentials, user_credentials, completed_routes, saved_places, saved_routes | user_credentials and completed_routes are cohort-stat sources only, never queried as a per-user leaderboard, per competitive-positioning.md |
| 0008 | business_photos (new table); profiles (new select policy only) | Build 3, phase 6.1 follow-up. Adds the photo storage 0004 left out for Businesses, and a narrow profiles read policy scoped to accounts that submitted a business, so a review_businesses reviewer can read created_at. Both back the "no photos" and "new accounts" signals in src/lib/business-queue-priority.ts |

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
| Build 2 | Added profiles.position, profiles.system_permission | Needed before any staff-gated table could check permissions |
| Build 2 | Added routes.status (draft/published) | Not in data-model.md, needed since admin-panel-spec.md implies a build-then-publish flow with no second reviewer |
| Build 2 | Added events.published, separate from lifecycle_status | admin-panel-spec.md names create/edit/publish as distinct actions, implying a draft state distinct from Upcoming/Ongoing/Past |
| Build 2 | Added discovery_content.needs_place_review | Flags the admin-panel-spec.md exception where new historical claims in Discovery content must route through the Places review queue |
| Build 3, phase 6.1 | Added business_photos table (0008) | data-model.md's "Pictures" field for Local Business was never given a table in 0004, unlike place_photos in 0003. Needed to evaluate the "no photos" review queue signal from vendor-mode-spec.md |
| Build 3, phase 6.1 | Added profiles_select_staff_business_submitters policy (0008) | profiles_select_admin (0001) only covered Admin. A Staff reviewer with only review_businesses had no way to read a vendor's created_at, needed for the "new account" review queue signal from vendor-mode-spec.md. Scoped to profiles that submitted a business, not profiles generally |
| Post-build-3 fix, 0009 | Replaced profiles_select_admin and profiles_update_admin with a public.is_admin() security definer function, same policies now call it instead of re-querying profiles inline | profiles_select_admin's own subquery selected from public.profiles, the same RLS-protected table the outer policy gates. This worked while every account's staff_role was null, since only profiles_select_own matched, but once an account's staff_role was set to admin, the self-referencing subquery caused the login profile read to hang. is_admin() runs as security definer, resolving the staff_role check without re-entering RLS on profiles |
| Phase 5.3 | Added src/pages/admin-discovery-content-review.tsx and the /admin/places/discovery/:id route (App.tsx), gated on manage_places | step-4-plan.md's review exception reuses "the same table and verify/reject actions" for flagged discovery_content rows, but admin-place-detail.tsx is specifically the Place edit form, none of whose fields apply to a discovery_content row. A small dedicated review view was added instead of stretching that form to a second shape, per constraints.md's Inventory Before Suggesting rule against forcing an unrelated fit. admin-places.tsx now also queries discovery_content (needs_place_review = true) alongside places and merges both into one list with a Type column, per step-4-phases.md 5.3 |
| Phase 5.3 fix | Reject on a discovery_content row is log-only, no longer sets discovery_content.status = 'inactive' | An earlier pass had Reject auto-unpublish the row, which silently pulls a stop's content out of a live sequence. competitive-positioning.md and build-priorities.md both define a heritage walk as a narrative arc, each stop referencing the last and setting up the next, not standalone trivia — auto-removing one stop's beat breaks that arc with no review UI surfacing the sequence impact. admin-panel-spec.md's Trail Publishing exception gates PUBLISH ("route it through the Places review queue before the Trail goes live"), it doesn't police content already live. The actual fix now lives at the publish gate (5.4) instead |
| Phase 5.4 (partial) | admin-trails.tsx's publish gate now also blocks on any linked discovery_content with needs_place_review = true, not just stop_count = 0; blocked message links to the flagged entry's review page | admin-panel-spec.md's Trail Publishing exception exists specifically to gate publish on unresolved flagged content — the file's own prior comment already flagged that Phase 5 needed to close this gap "not silently skip it." The in-builder Review and Publish step (step-4-phases.md 5.4's other half — a trail-wide summary of flagged content inside the trail builder itself) is still deferred, this only covers the list-page gate |
| Pre-5.4 fix, human-approved | admin-trail-builder.tsx's persistStops rewritten from delete+reinsert to in-place update for survivors (matched by route_stops.id, `temp-` prefix distinguishes an unsaved pick from a real row) | A prior-pass comment in loadDiscoveryContent had already flagged that delete+reinsert changes route_stops.id on every Stops-step edit, silently nulling discovery_content.related_route_stop_id (on delete set null) for any content already attached. Left unfixed at the time per constraints.md's No Silent Overrides rule, flagged instead of patched. Confirmed still live and fixed now, immediately before 5.4, since 5.4's summary is exactly where an orphaned link would first surface as "missing" content to staff |
| Phase 5.4 (complete) | admin-trail-builder.tsx's Review and Publish step now shows a trail-wide summary (stop count, discovery content count, any flagged entries with the blocking stop named and a link to admin-discovery-content-review.tsx) and a publish/unpublish control | Closes the other half of 5.4 left open by the entry above. Reuses admin-trails.tsx's two blocking conditions (no stops; any needs_place_review = true) rather than inventing new gate logic, per constraints.md's Inventory Before Suggesting rule. Publish button is disabled up front here (not just erroring on click) per ux-ui-guidelines.md's Disabled/gated rule, a stricter application than the list page's dropdown-menu pattern allowed for |
| Phase 6.1 | admin-dashboard.tsx's Places pending count now sums places.verification_status = 'pending' with discovery_content.needs_place_review = true, same merged set admin-places.tsx's queue already lists as one. No Events card added, no separate Trails card added | step-4-phases.md 6.1: "pending counts for Events (if a pending concept applies) and any flagged Trail content in the Places queue count." Events has no pending/review concept — published and lifecycle_status are both fully staff-controlled with no second reviewer, admin-panel-spec.md's same "no second reviewer required" reasoning Trails already relies on — so no card was invented for it; a drafts-count card would misrepresent what Events actually asks staff to act on. Flagged Trail content explicitly folds into the Places number per the spec's own wording, not a new card |
| Found during 6.1, deferred | admin-dashboard.tsx's "Recent activity" feed queries place_reviews with no reviewed_type filter, so since migration 0014 it also pulls Trail Content ("discovery_content") review entries and mislabels every one as "a place" | Pre-existing gap from 0014's schema widen, sitting in code touched while building 6.1, not part of 6.1's own scope. Logged in open-questions.md Section 2 #1, human said fix later rather than now, per constraints.md's No Silent Overrides — flagged, not silently patched or silently left undocumented either |
| Post-6.1 fix, resolved | admin-dashboard.tsx's "Recent activity" feed now queries place_reviews twice, once per reviewed_type ('place', 'discovery_content'), and labels each set correctly ("a place" vs "Trail Content") instead of one unfiltered query | Closes open-questions.md Section 2 #1. No schema change needed, migration 0014 already added reviewed_type; this was a query-shape fix only |
| Read-through fix | admin-events.tsx's row action dropdown now includes Publish/Unpublish and a "Set status" (lifecycle_status) submenu, mirroring admin-trails.tsx's row-action publish/unpublish shape (inline error line, disabled trigger while updating) | step-4-phases.md 2.1/2.3 and step-4-plan.md both call for these "as row actions and inside the detail view" — admin-event-detail.tsx already had both controls, admin-events.tsx's list row only had Edit. Reused the existing row-action pattern per constraints.md's Inventory Before Suggesting rule rather than inventing a new one |
| Read-through fix | admin-event-detail.tsx's Publish button is now disabled with a visible reason (missing fields named inline) when title, description, category, or date_time are blank, matching admin-trail-builder.tsx's Review and Publish gate shape | step-4-phases.md 2.4: "Disabled publish button if required fields are missing, per ux-ui-guidelines.md's Disabled/gated rule." Only title is DB-required (0006); description, category, and date_time were chosen as the remaining gate fields since they're what makes an announcement meaningful once public (data-model.md, Home tab's "what CATO just published" per navigation-and-access-control.md). related_program, location, related_place_id, enrollment_info, and language stay optional, matching data-model.md's own "if applicable" framing. Known gap, flagged not fixed: the gate reads live form state, not the last-saved row, so an edited-but-unsaved field can flip the gate before Save Changes is clicked; out of scope here since no unsaved-changes tracking exists anywhere else in this codebase |
| Read-through fix | admin-trail-builder.tsx's persistStops now re-verifies every newly picked stop's id against places/businesses (verified_status = verified) immediately before inserting into route_stops, rejecting with a named, visible error via the existing stopsError state if any id no longer resolves | step-4-phases.md 4.5: "App layer must confirm the picked id actually exists in the matching table before insert, no foreign key enforces this" (architecture-notes.md's own Known Fragile Areas entry for route_stops.stop_id). place-business-picker.tsx loads its list once on open and can go stale while the picker or builder modal stays open; handlePick previously passed the picker's payload straight through to insert with no re-check. Guard sits in persistStops, the single insert choke point, not duplicated in handlePick, per ponytail's root-cause-over-symptom rule |

---
