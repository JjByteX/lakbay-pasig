# discovery-content-plan.md

Status: built, not yet run. Logged as decision-log.md entry #44.

## Done

**Saved page**
- Card grids in the Home photo card style: photo cards for Places and Businesses, plain cards for Trails and Completed, matching skeletons.
- Saved businesses fetch a cover photo. `trailMeta` is shared from `trail-card.tsx`.

**Database**
- Migration 0050 written: nullable `route_id`, `qr_token`, `entry_unlocks`, wider public read. Not applied.

**Trail player**
- Every entry of a stop shows, trail notes first. A place's own entries show on its first stop only.
- A stop unlocks at its largest entry radius, or 25 m with no entries.
- First stop is free. A one stop trail completes on proximity, after the completion check loads.
- QR entries show a locked line until scanned.
- A stop animates open when it unlocks live, not when saved progress loads (`motion.ts` tokens, reduced motion respected).

**Scan page**
- `/scan/:token` checks sign in, an unlocked stop and GPS, then saves the unlock.
- Shows the two real steps (finding location, checking the code), a Stop unlocked confirmation, and a specific next step for each dead end: how far to move, why location failed, or which trail to open.
- The trail opens with the scanned entry revealed and scrolled into view, once.

**Admin**
- Discovery content tab on place and business pages: add, edit, delete, reorder, QR checkbox, Download QR. A warning shows before an untick removes a code. A failed reorder reloads the list.
- Panel follows the guidelines: 8px grid spacing, the order tile matches the trail stop tile (`text-xs`, no raw size), and no explanatory lines.
- Trail builder dialog is Trail Notes: no typed order, radius prefilled, place entry count shown. Its older 12px spacing and `text-[10px]` badge predate this work and are not changed.
- "Trail Content" is "Discovery content" everywhere. Review pages handle an entry with no trail.

**Config and docs**
- `qrcode` and `@types/qrcode` in `package.json` and installed. `VITE_SITE_URL` in `.env.example` and `vite-env.d.ts`.
- Decision log #44 and architecture notes updated.

## Left

**Your decisions**
1. Flagged place entries are live right away on published trails. Hide them until verified?
2. Flagged place entries do not block publishing a trail, only flagged trail notes do. Block them too?

**You run**
- Apply migration 0050 and run `db lint`.
- Set `VITE_SITE_URL` wherever staff download codes.
- Type check and lint. The panel may trip complexity rules.
- Hand check: Saved grids at 390 px and large font, the Discovery content tab, a scan end to end on a phone, a one stop trail, a stop with no entries.

**Not planned, add only if asked**
- Hide a QR entry's text until scanned, which needs a server function.
- Staff preview of place entries before a trail is published.
- A "GPS is weak" hint on locked stops. The scan page covers its own case.
- A control to replace a QR token. It needs a developer today.
- Per trail hiding of a place's entries.

**Known limits**
- Tokens and entry text are readable through the API before a scan, so the scan is a convenience gate.
- A stop with no coordinates skips the GPS check on a scan.
- A one stop trail never completes if location is denied.
- Finishing a restarted trail again adds another `completed_routes` row. This was already so, and it inflates vendor completion counts.
- Seed pins are street level, so tight radii miss until pins are surveyed.

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

## Object entries: GPS at the place, QR at the object

GPS cannot place a visitor at one object (phone GPS is off by 10 to 20 m, and seed pins are street level). So the two checks split the job.

1. **GPS opens the stop.** Within the radius of the place pin, the stop unlocks, as above.
2. **QR opens an object entry.** A place entry can be marked "Unlock by QR scan". It stays hidden until the visitor scans the code at the object, and only once its stop is unlocked.

- The QR holds a link, `/scan/<token>`. A phone's own camera opens it, so the app needs no scanner library.
- The token is random and made by the system. Staff never type one.
- The code belongs to the place entry, so it is printed once and works in every trail through that place.
- A scan is saved per visitor, like trail progress, so it stays after a reload.
- A scan with the stop still locked, or outside a trail, shows the reason and links to trails that include the place.
- Entries not marked for QR show as soon as the stop unlocks.

## Decided

- **Names:** place entries keep "Discovery content". Trail entries are "Trail note". The admin label "Trail Content" (review queue, dashboard, review page) is wrong once place entries exist, so it becomes "Discovery content".
- **Default radius:** 25 m. Staff can set a smaller radius per entry. The unlock check ignores GPS accuracy, and phone GPS is often off by 10 to 20 m, so a default under about 15 m would often fail to unlock.
- **First stop is free:** Start still unlocks stop 1 on every trail, from anywhere.
- **One stop trail:** the stop unlocks free, but the trail only completes when the visitor is within the stop radius. Multi stop trails already gate their last stop by proximity.
- **Write access:** unchanged. `manage_places`, `build_trails` and admin. Not `review_businesses`.
- **Object level:** QR at the object, GPS at the place. No coordinates per entry.

## Defaults (built as written)

- **Scans are optional.** A trail completes without them. They add story, they do not gate the credential.
- **A scan also checks GPS.** The visitor must be within the stop radius at scan time, so a saved photo of the code does not work from home.

## What changes

**Database (needs your approval, migration 0050)**
- `discovery_content.route_id` becomes nullable.
- `discovery_content.qr_token`, nullable and unique. Set means the entry unlocks by scan.
- New table `entry_unlocks` (user, entry, time, one row per pair). Owner only access, same shape as `route_progress` (0018).
- Public read: a place entry is visible when it is active and its place or business is a stop in a published trail. Secrets stay reachable only through a trail.
- No change to the review trigger (0012, keys on the location) or the write policy (0013).

**Data layer**
- `trail-types.ts`: `TrailStop.discoveryContent` (one or null) becomes a list.
- `trail-query.ts`: load trail notes and place entries, order them, drop nothing. Load the visitor's `entry_unlocks`.

**Trail player**
- `trail-stop.tsx`: show every entry of an unlocked stop.
- `trail-detail.tsx`: unlock on the stop radius, default radius when empty, completion of a one stop trail on proximity.
- New `/scan/:token` page and route in `App.tsx`. It checks sign in, the stop is unlocked and GPS, then saves the unlock and opens the trail.
- A QR entry in `trail-stop.tsx` shows as a locked line, "Scan the code at the object", until unlocked.

**Admin**
- Place and business detail pages: new Discovery content tab beside Current Info and Review History. Hidden on a new, unsaved record.
- Trail builder dialog: edits trail notes only. Place entries show as plain text, "3 discovery content entries come from this place". No link.
- Label "Trail Content" becomes "Discovery content" in `admin-dashboard.tsx`, `admin-places.tsx` and `admin-discovery-content-review.tsx`.
- Place entry form: a checkbox "Unlock by QR scan" (a styled native checkbox, no Switch exists), plus "Download QR". A damaged code is reprinted from the same token. No regenerate button.
- Entry form, both kinds: the typed Sequence Order field goes. A new entry goes last, and order changes with up and down buttons, as on the Landing Page list. Unlock Radius stays, prefilled with 25 so staff do not type it.
- QR image needs a small library (for example `qrcode`) in `package.json`. You install it, I do not.
- The review page and any reader of `route_id` handle a null trail.

**Read before editing:** `bulk-review.ts`, `admin-notifications.ts`, `admin-dashboard.tsx`, `admin-places.tsx`, `admin-trails.tsx`, `admin-activity.tsx`, migration 0037 (activity trigger on `discovery_content`).

## UI rules applied (`ux-ui-guidelines.md`)

- One action, one place: each kind of entry has one edit surface.
- One label per concept: place entries and trail notes have different names.
- Automate: the system handles what it can, so there is no copy button, no per-trail hide control, no token field, no regenerate button and no typed order. Add hiding only if CATO asks.
- Human controls kept, one each: the entry text, the QR checkbox, Download QR, Unlock Radius (prefilled), up and down order. Each needs a person's judgment.
- No card inside a card: the stop shows its entries as one list in the stop's card.
- Every state: loading, empty, error, and a locked stop with a clear reason.

## Risks

- No foreign key on the location (known fragile area). Places cannot be deleted in the admin today, so no orphans yet.
- Business entries are always flagged for review (0012). A business entry joins the Places queue, as now.
- Existing entries all have a trail, so they become trail notes. No backfill.
- Seed coordinates are street level, not surveyed. A tight radius will miss until pins are exact.
- QR entry text still reaches the app before the scan, same as GPS locked text today. The lock is in the interface. Hiding it for real needs a server function, a later step if CATO needs it.
- A damaged QR code is reprinted with Download QR. A code that must be replaced has no in-app control, and needs a new token from a developer.
