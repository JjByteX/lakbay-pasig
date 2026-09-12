# decision-log.md

---
## AI RULES — READ FULLY BEFORE ANY ACTION
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

**#:** 1
**Date:** Step 5, Phase 6
**Milestone:** Step 5, Phase 6 — Result card and result detail

**Context:**
Building discover-business-detail.tsx's item list (step-5-phases.md 6.4) surfaced that migration 0015 (Phase 1) widened `businesses_select_public` from `verified` to `verified` or `pending`, but never widened `business_items_select_public`, which still gated on the parent row's `verification_status = 'verified'` only. A pending business's item list would silently return zero rows under RLS, not an error, undermining the exact visibility Phase 1 was meant to deliver for Discover.

**Options Considered:**
- Option A: Leave `business_items_select_public` as-is, ship Phase 6 with pending businesses showing no items (silently degraded, not flagged).
- Option B: Widen `business_items_select_public` to match the parent policy (`verified` or `pending`), same shape as 0015.

**Community Consensus:**
Not applicable, this is a same-codebase consistency fix (matching a sibling table's RLS to its own parent policy), not a technology or pattern choice with an external best-practice debate.

**Decision:**
Option B. New migration 0016 widens `business_items_select_public` to check the parent business for `verification_status in ('verified', 'pending')`, mirroring 0015 exactly. Schema and RLS are on architecture-notes.md's never-touch-without-approval list; flagged and confirmed before writing, per constraints.md's No Silent Overrides rule, matching how Phase 1's own migration was handled.

**Consequences:**
Discover's business detail page now shows a pending business's item list correctly, matching step-5-phases.md 6.4's own scoping. No other table or policy is affected, `business_items_select_own` and `business_items_write_staff` are unchanged. Any future widen of `businesses_select_public` should be checked against `business_items_select_public` (and any other child-table policy keyed off the parent's status) at the same time, this gap existed because the two were widened in two different passes.

---

**#:** 2
**Date:** Auth visual pass
**Milestone:** Authentication screens — image panel legibility

**Context:**
ux-ui-guidelines.md's Style Specification Rules prohibit gradients on any structural surface, including backgrounds. auth-layout.tsx's image panel is a structural surface. The panel's tagline text was made legible against the photo first with a flat navy overlay (bg-secondary/50 over the full image), then with a text-shadow after the overlay was removed on request. Neither fully solved the problem the user was seeing: the overlay dimmed the whole photo rather than just where the text sits, and the text-shadow alone was not enough contrast against the photo's sky. The user then explicitly asked for a dark gradient behind the text.

**Options Considered:**
- Option A: Keep text-shadow only, no gradient, stay strictly inside the no-gradients rule.
- Option B: Add a bottom-anchored linear-gradient scrim (navy to transparent) behind the tagline only, not the full panel.

**Community Consensus:**
Not applicable, this is a request to override a documented project rule, not a technology or pattern choice with an external best-practice debate.

**Decision:**
Option B, per explicit user instruction. This is flagged here rather than silently applied because it directly contradicts a "never use these under any circumstances" rule in ux-ui-guidelines.md, per constraints.md's No Silent Overrides rule. The gradient is scoped to the bottom half of the image panel only (not a full-panel wash), functions as a legibility scrim rather than decoration, and does not extend to any card, button, or other structural surface elsewhere in the app.

**Consequences:**
The image panel in auth-layout.tsx is now the one place in the app with a gradient. If ux-ui-guidelines.md's no-gradients rule is enforced by an automated check in the future, this file needs an explicit exemption. Any future gradient request elsewhere in the app should be flagged the same way, not treated as precedent already set by this one.

---

**#:** 3
**Date:** Step 7, Phase 0
**Milestone:** Step 7, Phase 0 — route_progress schema, leaflet removal

**Context:**
Two changes, bundled under the same milestone since both were confirmed together before any step 7 UI work started.

First: step-7-trail-plan.md's own Schema Change First section flags that `completed_routes` (0007) is written once at finish, all or nothing. No table tracked which stop a user had reached on a trail started but not finished, so closing the app mid-walk had no way to resume, the next open restarted from stop one.

Second: map-vector-restyle-plan.md (not present in this checkout, referenced only in code comments) left an Open Item: leaflet and react-leaflet stayed installed after discover-map.tsx was rewritten to use maplibre-gl exclusively, deferred as "a separate, larger decision, out of scope here." Grepped before touching anything: only discover-map.tsx and main.tsx referenced leaflet anywhere in src/, and discover-map.tsx's own reference was already a stale comment, not live code.

**Options Considered:**
- route_progress — Option A: extend `completed_routes` with a nullable "furthest stop" column instead of a new table.
- route_progress — Option B: new table, one row per user per route, mirroring saved_places/saved_routes's shape (0007).
- leaflet — Option A: leave it installed, since nothing currently breaks by its presence.
- leaflet — Option B: remove it from package.json now that the Open Item's deferral reason (migration still in progress) no longer applies.

**Community Consensus:**
Not applicable to either half. route_progress is a same-codebase schema-shape choice (matching an existing sibling pattern), not an externally-debated technology choice. The leaflet removal is deleting an already-unused dependency, not a library selection decision.

**Decision:**
route_progress — Option B. A new table keeps `completed_routes`'s meaning intact (a finish event) instead of overloading it with in-progress state, and matches the one-row-per-user-per-target shape every other personal-record table in 0007 already uses, per constraints.md's Inventory Before Suggesting rule. Owner-only RLS, identical `using`/`with check` shape to `saved_places_own`. See migration 0018.

leaflet — Option B. The deferred Open Item's stated reason (a separate, larger decision) is resolved now: nothing in the app renders a Leaflet map, so keeping the dependency installed serves no purpose and adds two unused packages to every future `npm install`. Removed from package.json's dependencies and devDependencies. `package-lock.json` is deliberately left untouched, per explicit instruction not to run `npm install` this session, a hand-edited lockfile risks a broken `npm ci` for teammates, which is worse than a lockfile that resolves itself on the next real install.

**Consequences:**
route_progress: any future Trails UI work reads/writes this table through a new `src/lib/trail-progress.ts`, mirroring saved-places.ts. A stop reorder in admin-trail-builder.tsx after a user has started a trail does not invalidate their saved position, since `highest_unlocked_stop_id` references `route_stops.id`, which persistStops already keeps stable across a reorder (see this file's Pre-5.4 fix entry).

leaflet: `package.json` no longer lists leaflet, react-leaflet, or @types/leaflet. `package-lock.json` still lists them until the next `npm install`, this is expected and self-resolving, not a bug. Any future map work in this codebase should use maplibre-gl, matching discover-map.tsx, not reintroduce leaflet.

---

**#:** 4
**Date:** Step 8, Phase 1
**Milestone:** Step 8, Phase 1 — Saved and Profile lib functions

**Context:**
Three new list-fetch functions (fetchSavedPlaces, fetchSavedRoutes, fetchCompletedRoutes) all needed the same route-id-to-credential-name lookup trail-query.ts's fetchPublishedTrails already resolves internally via a private fetchCredentialNamesByRouteId. Separately, trail-completion.ts's own file header explicitly stated it has no read function, on the reasoning that no per-user ranking or cohort query should exist over completed_routes; fetchCompletedRoutes adds exactly such a read function to that file.

**Options Considered:**
- credential lookup — Option A: copy the same lookup logic into saved-routes.ts and trail-completion.ts separately.
- credential lookup — Option B: export the existing private function from trail-query.ts, import it in both new callers.
- completed_routes read — Option A: leave the file's no-read-function stance as an absolute rule, put fetchCompletedRoutes in a new file instead.
- completed_routes read — Option B: add the function to trail-completion.ts, update the file's own header comment to state why this read doesn't violate the original reasoning.

**Community Consensus:**
Not applicable to either half. Both are same-codebase reuse and scope-clarification choices, not technology or pattern decisions with an external best-practice debate.

**Decision:**
credential lookup — Option B. Copying the lookup into two more files creates three copies of the same logic for no reason, directly against constraints.md's Inventory Before Suggesting rule and ponytail's reuse-before-writing ladder. fetchCredentialNamesByRouteId is now exported from trail-query.ts and imported by saved-routes.ts and trail-completion.ts.

completed_routes read — Option B. A new file just to hold one read function, when trail-completion.ts already owns every other read and write against this table, would fragment a single table's data access across two files for no structural reason. The original no-read-function comment was reacting to a specific risk (a per-user leaderboard or "your Nth visit" query), not to reads in general; fetchCompletedRoutes reads one user's own rows only, same shape as isRouteCompleted already uses, and is the personal-record case navigation-and-access-control.md's Saved tab describes. Flagged here rather than silently reversing the file's stated stance, per constraints.md's No Silent Overrides rule. The file's header comment now explains this distinction directly, so a future reader doesn't see the reversal as unexplained drift.

**Consequences:**
Any future code needing a route-id-to-credential-name map should import fetchCredentialNamesByRouteId from trail-query.ts, not write a fourth copy. trail-completion.ts is no longer a write-only file; any future addition to it that reads across users (a count, a rank, a "most completed" query) should still be treated as the violation the original comment was written to prevent, fetchCompletedRoutes does not open the door to that, it is scoped to `.eq("user_id", userId)` and nothing wider.

---

**#:** 5
**Date:** Step 8, Phase 3
**Milestone:** Step 8, Phase 3 — Saved page loaded state

**Context:**
Two related problems surfaced building the Saved page's three sections. First, save-button.tsx and save-route-button.tsx are both self-contained: neither had any way to tell a parent list that a toggle succeeded, but step-8-plan.md's Saved page scope explicitly requires the unsave heart to remove its own row ("Saved is not read only"), and neither existing call site (discover-place-detail.tsx, trail-detail.tsx) needed that signal before now. Second, a row that needs both a tap-to-navigate area and a heart control can't nest the heart inside trail-card.tsx's or verified-item-card.tsx's existing single-`<button>` row shape, a button cannot contain another interactive button.

**Options Considered:**
- onToggle signal — Option A: have the Saved page re-fetch its whole section after any heart tap, skip a callback prop entirely.
- onToggle signal — Option B: add an optional `onToggle?: (saved: boolean) => void` prop to both heart components, fired only after the underlying toggle call resolves.
- Row composition — Option A: modify trail-card.tsx and verified-item-card.tsx themselves to accept an optional trailing-control slot.
- Row composition — Option B: leave both components unchanged, add small sibling-composition wrapper rows (saved-place-row.tsx, saved-trail-row.tsx, completed-trail-row.tsx) specific to the Saved page.

**Community Consensus:**
Not applicable to either half. Both are same-codebase composition and prop-shape choices, not technology or pattern decisions with an external best-practice debate.

**Decision:**
onToggle signal — Option B. A full section re-fetch on every heart tap is a real network round trip for a purely local list-membership change the caller already knows the outcome of; the optional prop is additive (both existing call sites pass none and are unaffected) and fires only on confirmed success, so a failed toggle that reverts never fires it and a stale row is never removed.

Row composition — Option A was rejected: trail-card.tsx is trails.tsx's own catalog row with no per-user save state, and verified-item-card.tsx's prop type is home-types.ts's RecentlyVerifiedItem, which requires a verified_at field fetchSavedPlaces's DiscoverPlace return has no reason to carry (already resolved once in Step 8, Phase 1's own entry above). Reshaping either shared component to fit one new caller's layout need risks the same component serving two different jobs. Option B: three small wrapper/row components, each specific to the Saved page, composing the existing shared component as a sibling next to a heart rather than modifying it, per constraints.md's Inventory Before Suggesting rule (extend by wrapping, don't reshape a component every other caller already relies on).

**Consequences:**
Any future list that needs a heart-toggle-and-tap row (place or route) should follow the same sibling-composition shape these three row components establish, not nest a heart inside trail-card.tsx or verified-item-card.tsx directly. save-button.tsx and save-route-button.tsx's onToggle prop is now available to any future caller needing the same "tell me when this succeeded" signal, not just the Saved page.

---

### Entry Format — copy this block for each new decision

**#:**
**Date:**
**Milestone:** (e.g. "Project start", "30% — authentication approach")

**Context:**
What situation or problem forced this decision?

**Options Considered:**
- Option A:
- Option B:

**Community Consensus:**
What do experienced developers say about each option today?
(AI: search this before the milestone conversation — do not fill from memory alone)

**Decision:**
What was chosen and why?

**Consequences:**
What does this decision affect going forward?
What becomes harder or easier because of this choice?

---
