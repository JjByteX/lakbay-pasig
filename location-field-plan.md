# Location Field Plan

Set a place or business location with a draggable map pin. The pin sets the coordinates. The address text fills in from the pin.

Approved and built: the pin is the source of truth. No schema change, so no migration gate.

## Problem

- Address is plain text. Nothing turns it into coordinates. The form says it does (business placeholder and help text), but no geocoding step exists.
- So a place or business made in the app has null coordinates. Discover's map skips it, it gets no directions and no distance sort, and a trail stop that points at it never unlocks (`trail-detail.tsx` skips a stop with no coordinates).
- Only the 8 seeded rows have coordinates, street level and not surveyed (decision-log #17).
- Address is never shown on any public page. It is stored and nothing reads it.

## Scope

In:
- Pin on the admin place form, admin business form, and vendor create and edit forms
- Address field that also searches, and fills from the pin
- Find my location button
- Address shown on both public detail pages

Out:
- Address as structured fields (street, barangay, city)
- Geocoding the address on save
- Paid or Google geocoders
- Warning when a pin lands outside Pasig
- Events and trails
- Fixing old rows in bulk
- General area pin for home based vendors
- Database range check on latitude and longitude

## Decisions

| Item | Choice | Why |
|---|---|---|
| Source of truth | The pin sets position. Address is a label | Pasig addresses use lot, block, sitio and barangay, and OSM house numbers are patchy. A pin is exact. Flips `data-model.md`, fixed under Docs |
| Pin input | Draggable marker. A tap on the map moves it | Google Maps, Airbnb and Booking.com all do this |
| Address | One field that also searches. Enter or the search icon runs it, top 5 in a plain list under the field, limited to Pasig. Picking a result sets the pin and the address. Dragging the pin refills the address only when it is empty or still the last fill. A drag never overwrites typed text | Airbnb's flow: type, pick, then check the pin. One field for one idea. Structured fields fight local addresses |
| Public address | A muted line under the category on both detail pages, same style as the category line. No heading, no icon, hidden when empty | Address is basic info, not a visit info block, so entry #20's position rule does not apply |
| Find my location | Button on the map, `LocateFixed`, label "Find my location" (same as Discover). One read, no watch | Vendors stand at their shop. Decision #16 allows one read for a single action |
| Pin required | Yes, on all three forms, vendor included | A listing with no pin is not on the map. Find my location makes it one tap |
| Provider | Photon public server, search and reverse. One base URL constant, same shape as `OSRM_BASE_URL` in `directions.ts` | Free, no key, fits the budget rule. Nominatim bans client autocomplete. Google terms bar its results on a non-Google map and cap storing coordinates at 30 days |
| Map style | Discover's own style, moved to `src/lib/map-style.ts` | Same look on every map. Exporting from `discover-map.tsx` adds a lint warning (`only-export-components`) |
| Theme | Read once at mount | Switching theme mid form is rare. `ponytail:` add the observer if it shows up |
| Precision | Round to 6 decimals | About 0.1 m. Keeps the activity log short |
| Icons | Lucide `MapPin` marker, `LocateFixed` on the button, `Search` icon button inside the address field | Same icons Discover uses for the same ideas |
| Pin label | None on the map. The save gate names it "Map pin" | The map sits under the field, it explains itself |
| Failure | Geocoder down or empty: pin and typed address still work. Specific message, no block | Never block a save on a third party |
| Files | `src/components/location-picker.tsx` (root, like `avatar-upload.tsx`), `src/lib/geocode.ts` (like `directions.ts`) | Matches where shared parts already live |

Lazier option, if you want less: OpenFreeMap's hosted style URL is one line, but it looks different from Discover and has no dark mode.

## References

- Google Maps, add a missing place: type the address or tap the map to move the pin, then edit the parsed address. https://support.google.com/maps/answer/6320846
- Airbnb: pick a suggested address, adjust it, then drag the map until the pin is right. https://www.airbnb.com/resources/hosting-homes/a/358
- Booking.com: drag the red pin. Hosts report getting stuck on its pin check, so we never cross check pin against address. https://partner.booking.com/en-us/help/property-page/general-info/changing-your-property-address-and-map-coordinates

## Changes

Database

None. `latitude` and `longitude` (double precision, nullable) exist on both tables since 0003 and 0004. RLS is row based, so vendors and staff already write them.

App

| File | Change |
|---|---|
| `src/lib/map-style.ts` (new) | Move `LATTE`, `MOCHA`, `buildStyle`, `PASIG_CENTER`, `DEFAULT_ZOOM` from `discover-map.tsx`. Pure move, no edits |
| `src/components/public/discover-map.tsx` | Import them. Nothing else. Discover must look the same |
| `src/lib/geocode.ts` (new) | `searchPlaces`, `reverseGeocode`, `formatAddress`. One assert check for `formatAddress`, same pattern as `page-title.ts` |
| `src/components/location-picker.tsx` (new) | The Address field with its search and results list, the map, the marker, Find my location. Replaces the Address block in both forms. Takes address and coordinates and returns new ones. Label, placeholder and required marker come in as props, since the place and business forms word them differently. Reuses the `Coordinates` type from `discover-query.ts` |
| `src/pages/admin-place-detail.tsx` | Add `latitude` and `longitude` to form state, empty form, fetch select and form mapping. Picker replaces the Address block on step 1. Add "Map pin" to `missingRequired`. Save already spreads the form |
| `src/components/business/business-fields.tsx` | Add both to `BusinessFormState` and `EMPTY_BUSINESS_FORM`. Picker replaces the Address block. Reword `FIELD_HELP.address` and the default address placeholder, they promise generated coordinates. Covers admin and vendor |
| `src/lib/vendor-types.ts` | Add both to `VendorBusinessDetail` and `VendorBusinessPayload`. They join the allow list. Fix the comment that says no geocoding exists |
| `src/lib/vendor-business.ts` | Add both to the `fetchOwnBusiness` select |
| `src/pages/vendor-dashboard.tsx` | Map both in `businessToForm` and `formToPayload`. Add the pin to `canSubmit` and `canSaveEdit`. Reword the two address placeholders |
| `src/pages/admin-business-detail.tsx` | Add both to the fetch select, `setForm` and the save payload. Add the pin to `canSubmit` |
| `src/pages/discover-place-detail.tsx` | Add `address` to `PlaceDetail` and the select. Render it under the category line |
| `src/pages/discover-business-detail.tsx` | Same, under the category line and above the badge |

Docs

| File | Change |
|---|---|
| `docs/data-model.md` | Address becomes a label filled from the pin. Map Coordinates becomes set by pin. Both sections |
| `project-foundation/decision-log.md` | Entry #21: pin over address as source of truth, Photon, address as basic info (outside #20's position rule), and the directions weighed (autocomplete first, pin first, both) |
| `project-foundation/architecture-notes.md` | Add `geocode.ts` and `location-picker.tsx` to the dependency map. One Current State line: coordinates come from the pin, nothing geocodes an address on save |

## Not touched

- Migrations, RLS, triggers
- Activity log. It diffs whole rows, so a pin move logs as a change with the new numbers
- `discover-query.ts`, `home-query.ts`, `trail-query.ts`, `result-card.tsx`. They already read coordinates
- `DiscoverPlace` and `DiscoverBusiness`. Address lives on the detail pages only, same as Rules
- `seed.sql`. The 8 rows keep their coordinates and open on the pin for adjustment
- `business-queue-priority.ts`

## Notes

- Vendor pins go live at once under the Pending badge, like all vendor text. Review sees the pin in the admin business form.
- A pin and now the address text show where a vendor works. A home based vendor can pin the street corner and leave off the house number. No general area option.
- OSM address data in the Philippines is patchy. Reverse lookup can return a road only, or nothing. The address then stays as typed.
- Photon's public server has no uptime promise and asks for reasonable use. Volume here is staff and vendor edits only. `ponytail:` self host if it throttles.
- Rows made in the app before this have no coordinates. Count them on hosted: `select count(*) from places where latitude is null`, same for businesses. Required pin repairs each one on its next edit.
- In the address field, Enter searches instead of submitting. On place form step 1 that replaces Enter as Next for this field only.
- Search runs on Enter, not as you type. It keeps to every provider's policy and needs no debounce. `ponytail:` add as you type if Photon stays the provider and it feels slow.
- Place form step 1 grows by the map height. Check the two column layout at `lg`.
- States to build: no pin yet, pin set, searching, no results, geocoder error, locating, location denied (reuse Discover's messages), address lookup failed.
- Attribution: the map keeps its OSM credit. No extra Photon credit was found in its terms (see Check results).

## Check before build

1. Photon answers a browser call (CORS). Done, passes.
2. Search each seeded name and address. Note which ones it finds. Done, mixed.
3. Reverse lookup at 3 seeded coordinates. Note whether the barangay comes back. Done, all 8 checked.
4. Photon usage terms. Done.
5. Count rows with no coordinates on hosted. Done.

## Check results

Run from the running app page against the public Photon server. Search used the name plus "Pasig", `limit=5`, and `bbox=121.03,14.52,121.13,14.62`.

**1. CORS.** Passes. A fetch from the app page returned data for search and reverse with no custom headers, so there is no preflight. `limit` and `bbox` are accepted. `lang` was not tested and is left out of the build.

**2. Search, 8 seeded rows.** Distance is from the top hit to the seeded point.

| Seeded row | Hits | Top hit to seeded point |
|---|---|---|
| Pasig City Museum | 1 | 14 m |
| Immaculate Conception Cathedral | 5 | 5,473 m |
| Bahay na Tisa | 1 | 6 m |
| Plaza Rizal and Bitukang Manok | 4 | 53 m |
| Youth Development Center | 1 | 145 m |
| Panaderia Dimas-Alang | 1 | 1,329 m |
| Three Sisters' Restaurant | 1 | 441 m |
| Ado's Panciteria | 1 | 125 m |

Five rows have a top hit within 150 m. Three do not: the cathedral, Panaderia Dimas-Alang and Three Sisters'. The output cut off the hit names, so it is not known whether a far hit is a different place or a badly placed seeded point. Seeded coordinates are landmark level and not surveyed (decision-log #17), so either is possible. Either way, search only suggests. The pin decides.

**3. Reverse, all 8 seeded points.**

- The barangay field is `locality`. It came back on all 8 rows. `district` holds a congressional district ("Pasig First District"), not a barangay, so it is not used.
- `locality` is the nearest OSM area, not always the seeded barangay. The three seeded Malinao rows (cathedral, Plaza Rizal, Ado's) all returned the same locality, one that starts with "Do", not Malinao. The full name was cut off in the output.
- `street` was missing on 3 of 8. `housenumber` was missing on 7 of 8. Only Three Sisters' returned one, 77, against the seeded 136 West Capitol Drive.
- `name` came back on 7 of 8. A building point returns the building's name, which is not part of an address.

**4. Usage terms.** The public server is a demo. It is free, asks for fair use, throttles or bans extensive use, gives no availability promise, and may change without notice (Photon README and maintainer discussion 598). No extra Photon credit was found. The OSM credit already in Discover's map attribution covers the data. The Photon home page blocks automated reads, so it was not read directly. Its terms were taken from the README, the discussion, and the R package docs that quote the home page. That R package throttles the public server to 1 request per second. Search on Enter only stays far under that.

**5. Hosted row counts.** A row counts when latitude or longitude is null, since Discover skips a row missing either.

| Table | No coordinates | Total |
|---|---|---|
| places | 2 | 7 |
| businesses | 0 | 3 |

Two places made in the app before this change have no pin, so they are missing from Discover's map and their trail stops cannot unlock. The required pin repairs each one the next time it is edited. Every business already has coordinates.

**Effect on the build**

- No `lang` parameter.
- `formatAddress` joins housenumber and street, then locality, then city. Every part is optional. It skips `name` and `district`. It returns an empty string only when all parts are missing.
- The results list shows each hit's full label and never auto picks the top hit.
- A filled address is a nearest area label. Staff and vendors can edit it, and a drag never overwrites typed text.
