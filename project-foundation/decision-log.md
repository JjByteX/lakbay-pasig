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

**#:**
**Milestone:**

**Decision:**

**Standing rule:**
