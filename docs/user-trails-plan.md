# user-trails-plan.md

Status: schema approved. Migration 0054 and its check are written and pass. App code: phases 1 to 6 done. The feature is complete except the items under "Left out".

## Goal

A signed-in user builds a private trail from places and businesses, walks it alone, and unlocks each stop's discovery content. CATO trails stay the only verified ones.

## Decided

- Same tables with a `routes.personal` flag. The system already reuses `routes` and the player, and ponytail says reuse before adding. Separate tables would need a second progress table and a second player.
- Place entries show through a user's own trail, even for places in no published trail. Few trails exist, and 0050 already ties entries to trails, not to browsing.
- "Your trails" lives in the Trails tab, where walks start. Saved stays for saved CATO items.
- Private. Only the owner sees a user trail, staff included.
- No credential, no completion row, no stats. Enforced in the database.
- Sign in to build, same as Save and Start.
- Limits: 10 trails per user, 12 stops per trail.
- Stops come only from places and businesses the user can already read.
- Stops are ordered automatically, nearest next. No manual order in v1.
- Only place entries show. User trails have no trail notes, so no story link between stops.

## Flow

1. Trails tab, signed in: a "Your trails" section above the catalog, with a Make a trail button.
2. Builder: pick stops from saved places, saved businesses, or search. Name is optional and defaults to "My trail".
3. Walk: same player as CATO trails. First stop is free, later stops unlock by GPS, QR scans work.
4. Rename, change stops, or delete from the trail page.

## Fit check

- project-brief.md says building trail sequences needs human judgment (CATO). A user path goes around that. Fix: private, labeled Yours, never Verified. Approved.
- competitive-positioning.md test: Google cannot copy it, since each stop's content is CATO's.
- build-priorities.md wants each stop to set up the next. User trails lose that. Accepted: they are for freedom, not story.
- `routes.run_type` already has "self guided". It means a CATO trail walked without a guide. Not used as the owner flag.

## Reuse

- Tables: `routes`, `route_stops`, `route_progress`, `entry_unlocks`.
- Player and scan: `trail-detail.tsx`, `trail-stop.tsx`, `trail-unlock.ts`, `trail-scan.ts`.
- Picker source: `saved_places`, `saved_businesses`. Check `place-business-picker.tsx` before writing a new picker (constraints.md #3).
- Not reused: `admin-trail-builder.tsx`. It is staff only and 68 KB.

## Schema (0054, written)

1. `routes.personal` flag, plus a constraint: a personal trail is a draft and has an owner. It can never be published.
2. Owner policies on `routes` and `route_stops`. `with check` pins personal and owner, so a user cannot spoof an owner or flip a trail to official.
3. One restrictive policy on each table: a personal row is visible and writable only to its owner. Needed because the staff policies are `for all` and grant read too. This hides personal trails from staff and everyone else.
4. `discovery_content` select: place entries also show through a personal trail the caller owns.
5. `completed_routes` restrictive insert and update: the route must be visible and official. A made-up id or another user's trail fails. Update is covered too, because `completed_routes_own` is `for all`: without it a user could insert an official completion and then point it at their personal trail.
6. Cap triggers on `routes` and `route_stops`. A trigger, not a policy, because a count policy would also block editing a trail at the cap. The stop cap also fires when a stop's `route_id` changes, so a stop cannot be moved into a full trail. A reorder does not fire it.
7. `delete_my_account()` deletes personal trails first. `routes.created_by` has no cascade, so account deletion would fail without it.

Dropped from the first draft: the `activity_log` trigger change. `write_activity()` already writes nothing for a non-staff actor.

## App changes

Phase 1, done (query layer only, no UI):

- `trail-query.ts`: `fetchPublishedTrails` and `fetchRouteSummariesByIds` filter `personal = false`. `fetchTrailDetail` allows own, and returns `personal` (new field on `TrailDetail`). It skips the credential lookup for a personal trail.
- `vendor-dashboard.ts`: checked. A personal trail is always a draft, so the existing `status = 'published'` filter already dropped it. `personal = false` added anyway so the count never leans on that alone.
- `trail-scan.ts`: no logic change. `route_stops_own_personal` already lets the scan query see the caller's own personal stops, and `fetchTrailDetail` already resolves the trail. Comment updated.
- `entry-unlocks.ts`: comment only.

Phase 2, done (`trail-detail.tsx`): Save heart hidden for a personal trail, no `isRouteCompleted` lookup, and `maybeCompleteTrail` returns early so nothing is written. Credentials were already null from phase 1. Restart only shows once completed, so it never shows on a personal trail.

Phase 3, done (`src/lib/personal-trails.ts`, no UI):

- `fetchMyTrails(userId)`: own trails plus a stop count, for "Your trails". To open one, use `fetchTrailDetail`.
- `createPersonalTrail`, `renamePersonalTrail`, `deletePersonalTrail`, `savePersonalTrailStops`. Each filters `personal = true` and `created_by = me`, so a staff account can never rewrite or delete an official trail through them (staff policies are `for all`).
- `savePersonalTrailStops` uses the admin builder's method: a stop already on the trail keeps its row and only moves, so walk progress survives an edit. Removed stops are deleted, new ones inserted. Not atomic, safe to re-run.
- `orderNearestNext(stops, start?)`: greedy nearest-next. Starts at `start` (the person's location) or at their first pick. A stop with no coordinate goes last.
- `PersonalTrailError` for the cases with a message ready for the person: trail limit, stop limit, stop no longer available.
- New stops must be a verified place, or a verified or pending business. Decided: pending businesses are allowed. They are already public (0015) and the Saved page already shows them. Places have no public pending state (0003), so only verified places can be read or added. A rejected business cannot be added.
- A repeated stop is kept once. The 12 stop cap is checked before any write, and again by the trigger.

Phase 4, done (builder page):

- `src/pages/trail-builder.tsx`, routes `/trails/new` and `/trails/:id/edit` in `App.tsx`, both behind `ProtectedRoute` (a signed-out direct visit goes to /login). Reached by URL only until the "Your trails" section adds the button.
- Reuses `place-business-picker.tsx` (constraints.md #3) instead of a new picker. Three optional additions, the admin builder is unchanged: `includePending`, `savedIds` (saved items listed first with a Saved tag, which is how "pick from saved" works), and `latitude`/`longitude` on `PickedLocation` so ordering needs no extra lookup. Pending businesses show a Pending tag.
- The list is kept nearest-next live, starting from the first pick. No manual order. Name is optional ("My trail"). Save needs at least one stop. At 12 stops the picker is replaced by a note.
- Edit mode: rename, change stops, delete (confirm dialog). An official trail or someone else's id reads as not found.

Phase 4b, done (mark places that hold a secret). Approved after the first cut found it could not work without a database change:

- Place entries are readable only through a published trail or the caller's own trail (0050, 0054), so before a place is on a trail the app could not tell whether it has entries.
- `supabase/migrations/0055_locations_with_entries.sql`: `locations_with_entries()`, security definer, returns `(location_type, location_id)` only, never text. Active place entries only. Lists only places the caller could already read (verified places, verified or pending businesses), so it cannot reveal the id of an unverified place. Signed in only, anon cannot call it. Check groups 5.6 to 5.10 cover it.
- `fetchLocationsWithEntries()` in `personal-trails.ts`. The picker takes a `markedIds` prop: a "Has a secret" tag, listed right after the saved ones. The wording is one string in `place-business-picker.tsx`.
- Known and accepted: any signed in user can learn which places hold a secret, not what it says. That is the point, and the text stays hidden until unlock.

Phase 5, done ("Your trails" and the way in):

- `trails.tsx`: a Make a trail button for everyone. A guest is asked to sign in in place (`openAuth`), a signed-in person goes to `/trails/new`. A "Your trails" section sits above the catalog for anyone who has made some, with a stop count per trail, and the catalog is then headed "CATO trails". A failed read leaves the section out and never blocks the catalog.
- `trail-card.tsx`: optional `meta` prop, so a personal trail shows its stop count where an official one shows theme, duration and budget.
- `trail-detail.tsx`: an "Edit trail" button (to `/trails/:id/edit`) and a "Yours · only you can see this" label, only for a personal trail.

Phase 6, done (open or closed per stop in the builder):

- `hours.ts`: `getOpenStatus(value, now)` returns open or closed with a short detail ("until 5:00 PM", "opens tomorrow 9:00 AM", "open 24 hours"), or `null`. It reads the same stored hours the public pages print, on Manila's clock and not the device's. It returns `null` for no hours and for old free text hours, since guessing a schedule could send someone to a closed door. Temporarily or permanently closed shows as closed.
- `personal-trails.ts`: `fetchStopHours(stops)` reads `places.operating_hours` and `businesses.opening_hours` for the given stops. Changed from the earlier plan: the picker select is untouched. One lookup in the builder covers a stop just picked and a stop loaded from a saved trail, so there is one path, not two.
- `trail-builder.tsx`: each stop in the list shows "Open now · until 5:00 PM" or "Closed now · opens 9:00 AM" under its name. Words carry the meaning, colour only backs it up. A failed read leaves the stops without a mark and the builder keeps working. The mark is as of now, not as of the day the person plans to walk.

Original list, kept for reference:

`trail-query.ts` relies on RLS alone to show only published trails (see its header comment). The owner policy now adds the user's own rows to that read, so these need a filter:

- `trail-query.ts`: catalog and summaries add `personal = false`. Detail allows own.
- `vendor-dashboard.ts`: check its inclusion counts and add `personal = false`. A vendor's private trail should not count.
- `trail-scan.ts`: also match the user's own trails. Today it matches published only.
- `trail-detail.tsx`: skip `completeTrail` and credentials for personal.
- Save route button: hide for personal.
- `search_trails`: no change. It returns the caller's own trail, and the row carries `personal`, so the UI can label it Yours.
- New: builder page, "Your trails" section, nearest-next ordering, open or closed per stop from `hours.ts`.

Phase 7, done (gaps found in review):

- `global-search.ts`: the trail search now selects `personal` and the hit carries it. `global-search-bar.tsx` shows a "Yours" badge on your own private trail. The stale "published only" comment is corrected.
- `admin-trails.tsx` and `admin-global-search.ts`: both add `personal = false`. A staff account that builds a private trail in the app no longer sees it in Admin Trails or admin search, so it never meets the publish toggle (the 0054 constraint would have refused it with a raw database error).
- `privacy.tsx`: names private trails in the list of what the app stores and in the deletion line. Wording only, deletion already removed them.
- `decision-log.md`: entry #48.

## Check

`supabase/personal_trails_check.sql`, same shape as `activity_log_check.sql`. Eight groups:

1. Owner can build and read.
2. Other user, staff, and anon cannot read, update, or delete it. Official trails stay visible.
3. A user cannot publish a trail, flip it to official, own it as someone else, or touch official or other users' trails.
4. No completion row for a personal trail, by insert or by update. Official completion still works.
5. Entries show through an owned trail and nowhere else. Anon's entry count is unchanged.
6. Search finds your own trail, not anyone else's.
7. Caps hold, editing and reordering at the cap works, a stop cannot be moved into a full trail, one user's cap does not limit another.
8. Account deletion removes personal trails.

Verified by breaking four protections in turn (restrictive policy, completion policy, stop cap, draft constraint). The check failed on each. The completion update policy and the move-a-stop cap were found in review, reproduced first (a 13 stop trail, a completion row on a personal trail), then fixed and broken again to confirm 4.5, 7.6a and 7.6c catch them.

Run it on your local Supabase once:

    docker exec -i supabase_db_lakbay-pasig psql -U postgres -v ON_ERROR_STOP=1 < supabase/personal_trails_check.sql

I ran it on Postgres 16 with Supabase stubs, your 55 migrations (0054 included), and your seed. It passes. Not yet on a real Supabase stack. If 0054 was already applied anywhere before these two fixes, run `db:reset`: the migration was edited in place.

## Solo notes

- Private means no moderation and no public trace of where someone walks.
- Show open or closed on each stop in the builder, from `hours.ts`. Nobody should walk alone to a closed door.
- Mark places that have discovery content in the picker. That is the draw.

## Left out

Add only if asked.

- Share link.
- Suggest to CATO, then staff promote.
- Make my copy of a CATO trail. Cheap, likely the first ask.
- Manual reorder.
- Finished state for user trails.
- Duration and budget sums.
- User notes or photos per stop.
- Group trails.

## Known limits

- Same as discovery-content-plan.md: GPS is 10 to 20 m off, and entry text is readable through the API before unlock.
- User trails reach any place's entries, not only places in an official trail. Entry text is already a convenience gate.
- `stop_id` has no foreign key (0005), same as official trails. A user needs a real place id to reach its entries, and cannot read ids of unverified places.
- A stop with no entries still unlocks at 25 m and shows nothing.
- A staff account that builds a personal trail through the app is logged in `activity_log` like any staff write. Staff use the admin builder, so this is left alone.
- The seed has 2 published trails. open-questions.md #8 is about real data.
