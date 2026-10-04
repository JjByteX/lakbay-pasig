# discovery-content-plan.md

Status: decisions made, one question open. No phases yet.

## Goal

A place's discovery content is written once and follows the place into every trail. Story that links one stop to the next stays on the trail.

## Problems today

1. **Re-entry.** Every entry needs a trail (`route_id` is required). Put the same place in a second trail and all its entries are typed again. A typo fix is made once per trail.
2. **Dropped entries.** The trail builder lets staff add many entries per stop. The public side keeps one (`fetchDiscoveryContentByStopId` in `trail-query.ts` uses a Map and no order). The rest are lost.
3. **Stuck trails.** A stop with no entry never unlocks (`trail-detail.tsx` skips it), so the walk stops there. Publish does not block this.
4. **Free credential.** A one stop trail finishes when Start is tapped. No GPS check runs.

## Limit from CATO

CATO wants sequenced stories: each stop refers to the last and sets up the next (`feature-scope-changes.md` #3, `build-priorities.md` #3). Place level content cannot do that, since it does not know which trail it is in. So not everything moves to the place.

## Model: two kinds of entry, one table

| Kind | Name | `route_id` | About | Written | Edited |
|---|---|---|---|---|---|
| Place entry | Discovery content | null | The place, one room or one object | Once, on the place | Place page |
| Trail entry | Trail note | set | The link between stops | Per trail | Trail builder |

- Many entries per place is normal: one per room, object or story. Each has its own order. A stop can also hold several trail notes.
- A trail picks up its places' entries by itself. No copy, no button.
- Room name goes in the entry title. GPS cannot tell indoor rooms apart, so a stop's entries unlock together at the place pin.
- Per stop, the player shows trail notes first, then place entries.
- A stop unlocks at the largest `unlock_radius` among its entries. With no entries it uses the default radius.

## Decided

- **Names:** place entries keep "Discovery content". Trail entries are "Trail note". The admin label "Trail Content" (review queue, dashboard, review page) is wrong once place entries exist, so it becomes "Discovery content".
- **Default radius:** 25 m. Staff can set a smaller radius per entry. The unlock check ignores GPS accuracy, and phone GPS is often off by 10 to 20 m, so a default under about 15 m would often fail to unlock.
- **First stop is free:** Start still unlocks stop 1 on every trail, from anywhere.
- **One stop trail:** the stop unlocks free, but the trail only completes when the visitor is within the stop radius. Multi stop trails already gate their last stop by proximity.
- **Write access:** unchanged. `manage_places`, `build_trails` and admin. Not `review_businesses`.

## What changes

**Database (needs your approval, migration 0049)**
- `discovery_content.route_id` becomes nullable.
- Public read: a place entry is visible when it is active and its place or business is a stop in a published trail. Secrets stay reachable only through a trail.
- No change to the review trigger (0012, keys on the location) or the write policy (0013).

**Data layer**
- `trail-types.ts`: `TrailStop.discoveryContent` (one or null) becomes a list.
- `trail-query.ts`: load trail notes and place entries, order them, drop nothing.

**Trail player**
- `trail-stop.tsx`: show every entry of an unlocked stop.
- `trail-detail.tsx`: unlock on the stop radius, default radius when empty, completion of a one stop trail on proximity.

**Admin**
- Place and business detail pages: new Discovery content tab beside Current Info and Review History. Hidden on a new, unsaved record.
- Trail builder dialog: edits trail notes only. Place entries show as a count that links to the place.
- Label "Trail Content" becomes "Discovery content" in `admin-dashboard.tsx`, `admin-places.tsx` and `admin-discovery-content-review.tsx`.
- The review page and any reader of `route_id` handle a null trail.

**Read before editing:** `bulk-review.ts`, `admin-notifications.ts`, `admin-dashboard.tsx`, `admin-places.tsx`, `admin-trails.tsx`, `admin-activity.tsx`, migration 0037 (activity trigger on `discovery_content`).

## UI rules applied (`ux-ui-guidelines.md`)

- One action, one place: each kind of entry has one edit surface.
- One label per concept: place entries and trail notes have different names.
- Automate: no copy button, no per-trail hide control. Add hiding only if CATO asks.
- No card inside a card: the stop shows its entries as one list in the stop's card.
- Every state: loading, empty, error, and a locked stop with a clear reason.

## Risks

- No foreign key on the location (known fragile area). Places cannot be deleted in the admin today, so no orphans yet.
- Business entries are always flagged for review (0012). A business entry joins the Places queue, as now.
- Existing entries all have a trail, so they become trail notes. No backfill.
- Seed coordinates are street level, not surveyed. A tight radius will miss until pins are exact.

## Open question

**Object level unlock.** Should an entry unlock near its own object, not the place pin? That needs optional coordinates on each entry and a record of which entries a visitor has unlocked (new table). I recommend later, after the pins are surveyed. Until then the pin and radius apply to the whole stop.
