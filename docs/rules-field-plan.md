# Rules Field Plan

Add one optional Rules text field to places and businesses. Shown on their public pages.

Needs your approval before work starts: it is a schema change (architecture-notes.md).

## Scope

In:
- `rules` column on `places` and `businesses`
- Editable in the admin place form, admin business form, and vendor form
- Shown on both public detail pages

Out:
- Structured or tagged rules, icons, per-item rules
- Search or filter by rules
- Events and trails

## Decisions

| Item | Choice | Why |
|---|---|---|
| Storage | One nullable text column, `rules`, same name on both tables | Same as every other text field |
| Label | "Rules" everywhere | Short, plain, one label per concept |
| Limit | 500 characters, counter shown | Rules are a few short lines. Accessibility is 300, stories are 5000. No database limit, so raising it later is one number per form |
| Input | Textarea, placeholder "One rule per line" | Matches how it displays |
| Place form | Step 2, first field, above the history fields | Rules are short and quick to fill. History stays last |
| Step 2 label | "Step 2 of 2: Rules and history" | The label says what the page holds |
| Business form | Right after Opening Hours | Hours and rules both cover how to visit |
| Place page | After Facilities | Facilities is the last visit info block |
| Business page | After Contact, before Items | Items can run long and would bury it |
| Display | Heading "Rules", same heading and text styles as the sections beside it, line breaks kept, hidden when empty | Consistency. No card, no new tokens, no subtitle |
| Who edits | Staff on places. Staff and vendors on businesses | Same as the fields beside it |

Public position rule: Rules sits right after the last visit info section, before any long content.

## References

- Google Maps: "Know before you go" sits just under a place's basic info. https://www.androidpolice.com/googles-hidden-tip-section-just-became-my-secret-weapon-for-finding-great-places/
- Airbnb: free-text rules get their own section, and its help page says not to overwhelm guests with too many. https://airbnb.com/help/article/472/
- Booking.com: "The fine print" is its own section for details guests must know before booking. https://partnerhelp.booking.com/hc/en-us/articles/212708769-How-can-I-add-info-to-The-fine-print-

## Changes

Database

| File | Change |
|---|---|
| `supabase/migrations/0039_add_rules.sql` (new) | `alter table` add `rules text` to `places` and `businesses`. Assumes 0038 lands first, otherwise renumber |

App

| File | Change |
|---|---|
| `src/pages/admin-place-detail.tsx` | Add `rules` to form state, empty form, fetch select, and form mapping. Add the field at the top of step 2, above the history fields. Change the step 2 label to "Rules and history". Save already spreads the form, so no payload edit |
| `src/components/business/business-fields.tsx` | Add `rules` to `BusinessFormState`, `EMPTY_BUSINESS_FORM`, `FIELD_HELP`. Add the field after Opening Hours. Covers admin and vendor |
| `src/pages/admin-business-detail.tsx` | Add `rules` to fetch select, form mapping, and save payload |
| `src/pages/vendor-dashboard.tsx` | Add `rules` to `businessToForm` and `formToPayload` |
| `src/lib/vendor-types.ts` | Add `rules` to `VendorBusinessDetail` and `VendorBusinessPayload` |
| `src/lib/vendor-business.ts` | Add `rules` to the fetch select |
| `src/pages/discover-place-detail.tsx` | Add `rules` to the type and select. Render after Facilities |
| `src/pages/discover-business-detail.tsx` | Add `rules` to the type and select. Render after Contact, before Items |

Docs

| File | Change |
|---|---|
| `docs/data-model.md` | Add Rules to Local Historical Place and Local Business, with no name tag |
| `project-foundation/architecture-notes.md` | Add a 0039 row to the migration table |

## Not touched

- RLS. Policies are row based, a new column needs none
- Activity log. It diffs whole rows, so `rules` is logged with no change. Values over 120 characters log as changed with no text, same as description
- `discover-query.ts`, `home-query.ts`, `global-search.ts`, `saved-places.ts`, `trail-query.ts`. They read names and coordinates only
- `business-queue-priority.ts`. It scores description only
- `seed.sql`. The column is nullable
- Generated types. None exist

## Deploy order

Migration first, then code. The public pages select `rules`, so without the column every place and business page errors. This is the reverse of the 0038 drop.

## Notes

- Vendor text goes live instantly under the Pending badge (0015), same as description and contact. Same risk as today, covered by the existing report flag.
- Place form heights, estimated not rendered. Step 1 is unchanged. Step 2 is about 570px for a new place and about 720px for an existing place with photos.
- No name tag on the data-model line. Names go stale as the team changes, and git history already shows who added a field.

## Open questions

None.
