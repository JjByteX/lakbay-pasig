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
