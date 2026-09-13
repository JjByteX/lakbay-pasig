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

**#:** 6
**Date:** Events: end date/time
**Milestone:** Admin Events form — optional end date and time

**Context:**
Events (migration 0006, data-model.md) only ever had a single Date and Time field. A request came in for an end date/time toggle on the admin event form. This needs a new nullable column, schema is on architecture-notes.md's never-touch-without-approval list, and it's new scope beyond data-model.md's documented Event/Announcement fields, so both required flagging before writing anything, per constraints.md's No Silent Overrides rule.

**Options Considered:**
- Option A: new nullable `end_date_time` column, toggle reveals a second `datetime-local` input, no ordering validation.
- Option B: same schema change, plus a client-side check blocking submit when `end_date_time` is at or before `date_time`, with a visible inline reason.

**Community Consensus:**
Not applicable, this is a same-codebase schema-shape and validation-posture choice, not a technology or pattern choice with an external best-practice debate.

**Decision:**
Option B, requested directly after being asked which option better follows ux-ui-guidelines.md. Justification: the State Rules section requires every interactive element to have a defined error state, an end date/time field has an obvious failure mode (ending before it starts) that Option A leaves uncaught; and the Disabled/gated rule already requires a visible reason when a primary action is blocked, exactly the pattern `canPublish`'s `missingRequiredFields` message uses elsewhere in this same file. Extending that established pattern to the new field is also more consistent with the Consistency Rules section than leaving one gated field unvalidated next to another that already is.

**Consequences:**
Migration 0020 adds `events.end_date_time`, nullable, same optional-per-row shape as 0017's `verified_at`. admin-event-detail.tsx's `canSubmit` and `canPublish` both now also depend on `!endBeforeStart`, so a bad range blocks Create/Save, not just Publish. No other file needed a change: `announcement-card.tsx`, `event-detail.tsx`, `admin-events.tsx`'s list/table, and `home-query.ts`/`home-types.ts` all display `date_time` alone and were not asked to show a range. Any future UI that needs to show or filter by an event's end (a calendar view, a public-facing "ends at" line) should read `end_date_time` directly rather than deriving it, and should treat a null value as "no defined end," not as an error.

---

**#:** 7
**Date:** Settings: Personalization, Phase 0
**Milestone:** Settings sub-page — theme and font size preference schema

**Context:**
settings-personalization-plan.md confirmed dark mode and font size as new controls living on a Settings sub-page reached from Profile. Neither preference exists anywhere in the schema today: data-model.md's End User field list has no theme or font size field, and no `profiles` column backs either. Storage is confirmed synced to account (not local-only), so both need a home on `profiles`. Schema is on architecture-notes.md's never-touch-without-approval list, and this is new scope beyond the documented data model, so both required flagging before writing anything, per constraints.md's No Silent Overrides rule.

**Options Considered:**
- Storage — Option A: local-only (browser storage), no schema change, preference does not follow the user across devices or sessions.
- Storage — Option B: two new nullable columns on `profiles` (`theme_preference`, `font_size_preference`), synced to account, same shape as 0017's `verified_at` and 0020's `end_date_time`.
- Unset-value meaning — Option A: store an explicit default value at write time (e.g. `'light'`, `'default'`) for every new row.
- Unset-value meaning — Option B: leave both columns nullable with no stored default; the app decides what null means at read time (Phase 1's scope).

**Community Consensus:**
Not applicable, this is a same-codebase schema-shape choice (matching two existing sibling patterns already in this migration set), not a technology or pattern choice with an external best-practice debate.

**Decision:**
Storage — Option B, confirmed directly (`settings-personalization-plan.md`'s Storage section: "Confirmed. New nullable columns on `profiles`"). Matches the nullable-optional-column shape 0017 and 0020 already established, rather than inventing a new storage mechanism for what is structurally the same kind of per-row, per-user preference.

Unset-value meaning — Option B. Storing an explicit default at write time bakes today's UI decision (light is default, "small" font is default) into every row, so a future change to what the default means would require a data migration instead of a one-line code change. Nullable-means-unset keeps the column a pure preference record; Phase 1 of this feature owns translating null into a concrete value at read/apply time.

**Consequences:**
Migration 0021 adds `profiles.theme_preference` (text, `'light'`/`'dark'`, nullable) and `profiles.font_size_preference` (text, `'small'`/`'default'`/`'large'`, nullable), each with an inline check constraint permitting null, same pattern 0002's `system_permission_values` and 0003/0004's category/status columns already use. `auth-types.ts`'s `Profile` interface and `auth-context.tsx`'s `fetchProfile` select list both widened to include the two new columns, so every profile load carries them from this point forward. No RLS policy change needed: `profiles_update_own` (0001) already guards the row, and both columns are self-service preferences the signed-in user is expected to write to themselves, not staff-only fields requiring a new column-level boundary note. Any future preference stored per-account (not per-device) should follow this same nullable-column shape on `profiles` rather than introducing a separate preferences table for a two-column feature.

---

**#:** 8
**Date:** Settings: Personalization, Phase 3
**Milestone:** Settings sub-page — dark mode control primitive

**Context:**
settings-personalization-phases.md's Phase 3.1 specifies a Switch control for the dark mode row, but explicitly requires checking `src/components/ui` first, since architecture-notes.md's own changelog records admin-event-detail.tsx hitting this identical gap for its end-date toggle: no Switch primitive existed at that time, so a native checkbox was used instead. Confirmed again before writing this phase: `src/components/ui` still has no `switch.tsx`, and `@radix-ui/react-switch` is not in `package.json`'s dependencies (shadcn's Switch requires it). Adding it means an `npm install`, which this session is not running.

**Options Considered:**
- Option A: add `@radix-ui/react-switch` and a new `src/components/ui/switch.tsx`, matching shadcn's standard Switch setup.
- Option B: reuse the native-checkbox-styled-as-a-toggle fallback admin-event-detail.tsx's own end-date toggle already established for this exact same gap.

**Community Consensus:**
Not applicable, this is a same-codebase consistency choice (matching an already-established fallback for an already-encountered gap), not a technology or pattern choice with an external best-practice debate.

**Decision:**
Option B. Per constraints.md's Inventory Before Suggesting rule, a second instance of "no Switch exists yet" should reuse the fallback this codebase already chose once, not introduce a new dependency and a new primitive for a single control while an identical gap sits one file away already solved. The checkbox is styled identically to admin-event-detail.tsx's own (`h-4 w-4 rounded border-input accent-primary`, wrapped in a native `<label>` with the control and its text as siblings), adapted only for this page's own text size convention (`text-base`, matching profile.tsx and the rest of the public surface, not admin's `text-sm`).

**Consequences:**
Two now-established instances of "no Switch primitive, use a styled native checkbox" exist in this codebase (admin-event-detail.tsx, settings.tsx). If a third toggle is needed anywhere, or if dark mode's own control ever needs true Switch semantics (a11y role, drag gesture, etc.) beyond what a checkbox provides, that is the point to revisit adding `@radix-ui/react-switch` and a shared `switch.tsx` component once, covering all toggles at once rather than converting them one at a time. Until then, any future toggle should check for this same pattern before reaching for a new dependency, matching this entry's own reasoning rather than re-debating it.

---

**#:** 9
**Date:** Global search
**Milestone:** Shell-level global search, replacing Discover's own search bar

**Context:**
Discover previously owned the only search bar in the app, rendered into public-shell.tsx's top bar slot only while Discover was mounted (every other tab rendered that slot empty), and scoped to places and businesses only. A request came in to make search "always at the top," matching common practice in Spotify, Notion, and similar apps. This is a real scope increase, not a styling tweak: it touches navigation-and-access-control.md's tab model (Discover is specifically framed as "the daily habit... search tab," Home is deliberately passive with "no search needed") and requires deciding what a global search actually returns across four different content types. Flagged before building anything, per project-brief.md's rule to flag scope changes rather than silently build them, and open-questions.md's rule not to guess.

**Options Considered:**
- Scope — Option A: keep search Discover-only, no change.
- Scope — Option B: global search bar visible on every tab, querying only content types that have something searchable (Places, Businesses, Trails, Events), reached from wherever it lives rather than requiring a tab switch first.
- Query shape — Option A: a router that jumps the person to the right existing tab/page with the query applied, no merged query.
- Query shape — Option B: a real merged query, one function hitting all four tables in parallel, returning a unified grouped result rendered in a dropdown under the bar.
- Placement — Option A: all five tabs including Profile.
- Placement — Option B: Home, Trails, Discover, Saved -- not Profile.
- Discover's own existing search bar — Option A: keep it separate, alongside the new global one.
- Discover's own existing search bar — Option B: replaced by the same global bar, with Discover's live list/map filtering continuing to run off the same shared query text.

**Community Consensus:**
Not applicable, this is a project-specific scope and architecture decision (what this app's nav model should do), not a technology or pattern choice with an external best-practice debate to search for.

**Decision:**
Scope — Option B, confirmed directly ("Global search. Only go through other pages if the thing in that page is not searchable."). Four tables are genuinely name-searchable and public per data-model.md and each table's own RLS policy, confirmed directly rather than assumed: places (places_select_public, verified only), businesses (businesses_select_public, verified or pending), routes/trails (routes_select_public, published only), events (events_select_public, published = true, confirmed directly from migration 0006 before writing any code). Saved and Profile carry no independent searchable content of their own.

Query shape — Option B, confirmed directly. A router-only approach would still require building a per-tab "apply this query" wiring for four different pages and loses the "see results across everything without leaving where you are" behavior a merged dropdown gives; the merged query is more work up front but is what "global search" in the Spotify/Notion sense actually means, matching the explicit ask.

Placement — Option B, confirmed directly. Profile is a full account-settings page the person scrolls through top to bottom, not a lookup surface, the same reasoning navigation-and-access-control.md already gives Home for staying passive.

Discover's own search bar — Option B, confirmed directly. One search concept, one control, per ux-ui-guidelines.md's Label Rules ("one label per concept, one place per label") applied to controls generally -- keeping a second, narrower search input on Discover alongside a global one would be two overlapping search experiences on the same screen.

**Consequences:**
public-shell.tsx's TopBarSlotContext (a page pushed rendered content into the shell, discover.tsx was its only caller) is fully replaced by GlobalSearchContext (the shell owns query state directly and renders GlobalSearchBar itself, gated per route). This is a full replacement, not an addition alongside the old mechanism, flagged here per constraints.md's No Silent Overrides rule since it changes an existing architectural piece rather than only adding a new one. discover.tsx no longer owns its own search input; its filterDiscoverResults call is unchanged, only the source of the query text moved from local state to the shell's shared context via the new useGlobalSearchQuery hook. Any future tab that needs the search bar visible should be added to public-shell.tsx's SEARCH_VISIBLE_PATHS list rather than reintroducing a page-level slot mechanism. Any future fifth searchable content type should follow global-search.ts's existing per-table-function-plus-Promise.all shape, matching how discover-query.ts's fetchDiscoverResults and home-query.ts's fetchRecentlyVerified are already structured, rather than a new merged-query pattern.

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
