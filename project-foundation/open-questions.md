# open-questions.md

---
## AI RULES — READ FULLY BEFORE ANY ACTION
---

1. Read this file at the start of every session and at every
   major milestone.
2. Section 1 questions are hard blockers. Do not write any code
   or make any structural decision until all Section 1 questions
   are answered by the human.
3. Section 2 questions are active blockers. Do not pass the
   milestone they are tagged to without resolving them first.
4. When uncertain mid-build → do not guess. Add a question to
   Section 2 with its milestone tag, flag it to the human, and
   wait for an answer before continuing.
5. When a question is answered → move it to the Resolved log
   at the bottom. Never delete questions — resolved ones become
   part of the project's decision history.
6. Never answer your own questions with assumptions. If a question
   is here, it means a human decision is required.

---
## SECTION 1 — BEFORE STARTING
---
These must all be answered before any code is written.
If any are blank → stop and ask.

| # | Question | Answer |
|---|----------|--------|
| 1 |          |        |
| 2 |          |        |
| 3 |          |        |

---
## SECTION 2 — ACTIVE DURING BUILD
---
Questions that surfaced mid-project.
Each question is tagged to the milestone where it must be resolved.

| # | Question | Milestone | Answered? |
|---|----------|-----------|-----------|
| 1 | directions-distance-and-from-plan.md says a custom From "also unlocks Directions when there is no GPS fix." But the From row lives inside the directions panel, and the panel only mounts once a route exists (`directionsPanelResult`, set only by `handleRouteFound` after `ResultCard`'s fetch, which needs an origin). `userLocation` never returns to null once set (the watch's error callback is a no-op), and Cancel clears `customFrom`. So a person whose location is denied from the start has no origin, so `ResultCard`'s Directions stays disabled, so no panel ever opens, so the From row is unreachable and `customFrom` can never be set. Phase 3's wiring (origin passed through `ResultCard`) is correct and is what lets a custom From start a route, but on its own it only helps someone who set a From mid-session. How should a no-GPS person reach the From field? Options: (a) when there is no origin, `ResultCard` shows a "Choose a starting point" action beside the disabled Directions button, which opens the panel with the From field already open and no route yet; (b) Directions is always enabled and opens the panel in an empty state (no route, From field open) when there is no origin; (c) leave as-is and accept that the custom From only helps mid-session, and reword the plan's "unlocks Directions" line. (a) and (b) need a panel state with no `route`, which `directionsPanelResult` alone does not express today, and touch `result-card.tsx` and `handleRouteFound`'s contract. | Phase 4 (From row is built here; must be settled before its panel changes) | No |

---
## HOW TO ADD A QUESTION (AI instructions)
---

When you hit uncertainty mid-build:
1. Stop what you are doing
2. Write the question clearly and specifically —
   not "what should I do here?" but "should the user
   profile data be fetched on login or on page load,
   given that X and Y are both affected by this choice?"
3. Tag it to the nearest upcoming milestone
4. Tell the human: "I've added a question to open-questions.md
   before I can continue. See question #[N]."
5. Wait for the answer before proceeding

---
## RESOLVED QUESTIONS
---
Answered questions live here permanently as part of project history.

| # | Question | Answer | Resolved At |
|---|----------|--------|-------------|
| 1 | admin-dashboard.tsx's "Recent activity" feed queried place_reviews with no reviewed_type filter, mislabeling discovery_content ("Trail Content") reviews as "a place" since migration 0014 widened the table. | Query now runs twice, once per reviewed_type ('place', 'discovery_content'), each mapped to its correct section label. See architecture-notes.md's changelog. | Post-6.1 fix |
| 2 | Photos are real files (30, Google Drive export), not placeholder URLs. Serve from `public/` or upload to Supabase Storage? | Supabase Storage — human wants something demoable in production, not just local dev. | Content population round 1 |
| 3 | Does include-all-photos cover the 4 non-photo brand assets (2 logos, duplicate promo poster, founder portrait)? | Yes, included as rows in `business_photos`. | Content population round 1 |
| 4 | Three Sisters' Restaurant of Pasig: submitted contact info (10 East Capitol Dr.) doesn't match what the storefront photo suggests. Use as submitted or correct it? | Correct it. Verified via web search: their own Instagram (most recent) lists the current address as 136 West Capitol Drive, Brgy. Kapitolyo, Pasig, phone (02) 631-9247 / +63 917 636 2134. Older sources (2013-2020) confirm 8/10 East Capitol Dr. was the prior location before a documented move to West Capitol; the submitted address was the outdated one. Phone number carried over unchanged, consistent across old and new listings. | Content population round 2, verified via web search |
| 5 | NEW_DATA.md's 3 event categories (Cultural & Heritage, Youth & Education, Arts & Culture) don't match the 5 seeded `event_categories` rows. Map to existing categories or add new ones? | Add new. `event_categories` gets 3 new rows (Cultural & Heritage, Youth & Education, Arts & Culture) rather than force-fitting into workshop/festival/heritage walk/program enrollment/general announcement. | Content population round 2 |
| 6 | Should each seeded photo row carry a caption/alt text? Neither `place_photos` nor `business_photos` has a caption column today, so this would need a schema change. | No. Stays as-is, no new column, no captions. Rows keep only `photo_url`/`sort_order` (plus `photo_type` on places). | Content population round 3 |
| 7 | "Pasig Creative Arts Academy: Summer Youth Workshops" names "Youth Development Center" as its location, not among the 4 submitted Places. Add it as a new Place, or leave `related_place_id` null? | Add it. New Place, category Cultural Site, address F. Legaspi St., Rainforest Park, Barangay Maybunga, Pasig City. Historical fields (background, significance, year built, source) left minimal/not applicable since it's a modern civic facility, not a heritage structure. | Content population round 3 |
| 8 | Real Places/Businesses/Events are ready to seed, but no real Routes/Trails data has been submitted yet. The sample Routes/route_stops/discovery_content/trail_credentials all reference sample Place/Business rows being removed. Also, sample completed_routes/user_credentials/saved_routes/saved_places reference those same sample route/place IDs. Proposed: drop all Routes/Trails and dependent personal-record rows for now (empty until real Trail data arrives), rather than inventing placeholder trails over real content or leaving stale references. Confirm, or hold off content population until Trail data is ready? | Drop them. All sample/fake data being replaced anyway; leave routes, route_stops, discovery_content, trail_credentials, completed_routes, user_credentials, saved_routes, saved_places empty until real Trail data is submitted. | Content population round 4 (seed.sql rewrite) |
| 9 | Marker tap during map-pick mode (directions-distance-and-from-plan.md, "Map tap mode"): should tapping an existing place marker while "Choose on map" is active set From to that marker's own coordinates, and should the label be generic ("Pinned location") or the place's real name? | Confirmed via Google Maps' own support pages (support.google.com/maps/answer/144339) and its own JS Directions Service sample (a click anywhere sets a waypoint marker, no separate "empty map only" rule): Google draws no line between an empty map tap and a tap on an existing point. Tapping either sets the location. So this app does the same — a tap on an existing place marker while picking From sets From to that marker's coordinates, same as any other map tap, no special-cased "ignore marker taps" branch. Because that marker's name is already known data (it's a rendered place result, not a resolved address), the label uses the place's own name, not the generic "Pinned location" fallback — Google Maps never shows a placeholder label when it already has a name for the point tapped. "Pinned location" stays reserved for a tap on empty map with no place data to attach. `onMapPick`'s payload carries an optional name so both cases share one path: a marker tap passes the place's name, an empty-map tap passes none and falls back to "Pinned location". | Phase 0, resolved by researching the actual Google Maps pattern instead of guessing |
| 10 | `discover-map.tsx`'s `[userLocation]` effect calls `map.setCenter` and `map.setZoom(DEFAULT_ZOOM)` on every GPS tick. With a custom From set, that pulls the camera off the route drawn from it. Guard it? | Yes. Skip `setCenter`/`setZoom` while `customFrom` is set (directions-distance-and-from-phases.md 5.5). The blue dot's `setLngLat` keeps tracking the live position. The effect also depends on `customFrom`, so clearing the From (Cancel) recenters on the live position once. The same recenter during an ordinary route with no custom From is existing behavior and is left alone. | Phase 5 (built) |
| 10b | Follow-up to #10: reported as the map's view snapping away on its own while panning/zooming during Directions. Root cause was the "ordinary route with no custom From" case #10 left alone -- the effect still ran `setCenter`/`setZoom` on every GPS tick whenever Directions used the live location as origin, since the guard only checked `customFrom`. Widen the guard? | Yes. Guard is now `!customFrom && !directionsPanelResult` -- stands down whenever a Directions session is open at all (`directionsPanelResult` non-null), not only when a custom From is set. `directionsPanelResult` added as an effect dependency so closing Directions (Cancel, back to null) still recenters once, same as clearing a custom From already did. Blue dot tracking is unaffected. | Reported post-Phase-5, fixed directly in `discover-map.tsx` |
| 10c | Follow-up to #10/#10b: reported as the map feeling "stuck" outside Directions too -- any drag/pan snapped back to the live dot within about a second. Root cause was #10's own remaining case: the `[userLocation]` effect still recentered on *every* `userLocation` change, and `userLocation` ticks once a second from the shell's continuous `watchPosition` (public-shell.tsx) the whole time Discover is open, not only during Directions. "Find my location" should behave like every other maps app: a one-time recenter per tap, not a standing camera lock. Decouple the recenter from the live coordinate itself? | Yes. Added a one-shot `recenterRequestId` counter in `discover-map.tsx`, bumped only by `MapCornerControls`' own locate tap (via a new `onRecenterRequested` callback fired after `getCurrentPosition` resolves), never by the background watch. The `setCenter`/`setZoom` call now also requires either that counter having just changed or this being the very first fix of the session (`hasAutoCenteredRef`, so the map still auto-centers off the default Pasig view once on load without a tap). `userLocation` stays a dependency so the blue dot/heading cone still update every tick -- only the forced camera move is gated. `customFrom`/`directionsPanelResult` still stand the camera down entirely, unchanged from #10b. | Reported post-Phase-5, fixed directly in `discover-map.tsx` |

---
