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

---
