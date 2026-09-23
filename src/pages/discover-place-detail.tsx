import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readEmbeddedName } from "@/lib/place-categories";
import { getFacilityIcon } from "@/lib/place-facility-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SaveButton } from "@/components/public/save-button";
import { HoursDisplay } from "@/components/public/hours-display";
import { PhotoGallery } from "@/components/public/photo-gallery";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePageTitle } from "@/lib/page-title";

// Phase 6.3 (step-5-phases.md): full record fields from places (migration
// 0003), scoped through places_select_public, unchanged this step (verified
// only, a place has no Basic tier concept). Field list matches step-5-
// plan.md section 2 exactly: description, historical background, hours,
// entrance fee, facilities, plus name/category for the header and the
// verification badge every result already carries (navigation-and-access-
// control.md's v1 scope, no named contributor credit).
//
// Category Directory Expansion, Phase 1.3: facilities is now a joined
// place_facilities[] (migration 0026, facility_ids replaces the old
// places.facilities text[]), flattened at fetch time so this field needed
// no render change beyond the embed itself, per the expansion phases doc's
// own "no change to the render JSX" goal for that phase.
//
// Phase 3.3: the chip row's own scope now explicitly changes, gaining an
// icon beside each facility name (matching Discover's place category
// chips), so each row also carries the facility's icon, not just its name.
//
// History tab phase: full record view splits into a segmented Details /
// History tab control (Tabs primitive, same one discover.tsx already uses
// for its map/list switch). historical_significance, year_or_period and
// source_reference were already admin-editable (admin-place-detail.tsx)
// but had no public render at all until now; they join
// historical_background as History-tab content per data-model.md's Local
// Historical Place field list, all four being the "longer origin and
// development story" grouping. Fetched alongside the rest of the record,
// same query shape as before.
interface PlaceFacilityChip {
  name: string;
  icon: string;
}

interface PlaceDetail {
  id: string;
  name: string;
  category: string;
  address: string | null;
  description: string | null;
  historical_background: string | null;
  historical_significance: string | null;
  year_or_period: string | null;
  source_reference: string | null;
  operating_hours: string | null;
  entrance_fee: string | null;
  facilities: PlaceFacilityChip[];
  rules: string | null;
  verification_status: "verified";
}

/**
 * Phase 6.2-6.3, 6.5-6.6: full record detail page, separate from the
 * Phase 6.1 preview card (result-card.tsx's modal shows only name,
 * category, description). Reached via the preview card's "View full
 * details" link (result-card.tsx), per step-5-phases.md 6.2's "opens from
 * a marker tap or list row tap" read through the tap-to-preview flow
 * already built in Phase 4.4/5.2. Nested under PublicShell (App.tsx), the
 * bottom nav and top bar stay visible per ux-ui-guidelines.md's Layout
 * Shell Rules. Back control top-left per the same file's Mobile placement
 * convention, navigate(-1) returns to the map or list exactly as the user
 * left it, since discover.tsx isn't remounted by this navigation.
 */
export default function DiscoverPlaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  usePageTitle(place?.name ?? "Discover");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Map hover/full-details photos phase: every photo this place has
  // uploaded, not just the cover photo the map hover/marker preview use
  // (result-card.tsx and discover-map.tsx's HoverPreview only need one).
  // Own state, own load, independent of the notFound branch below --
  // an empty array here (no rows yet) is a legitimate, unremarkable
  // result, not an error, so there is no separate photosError to track.
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    supabase
      .from("places")
      .select(
        "id, name, address, description, historical_background, historical_significance, year_or_period, source_reference, operating_hours, entrance_fee, rules, verification_status, place_categories(name), place_facilities(name, icon)"
      )
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        // A guest or resident can only ever be shown a verified row,
        // per places_select_public; a not-found or unverified id (e.g. a
        // stale link) reads identically here, both are "nothing to show,"
        // per Phase 8.3's error-state scope this stays a simple message
        // rather than distinguishing the two causes.
        if (error || !data) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        // Phase 1.4/1.10 (category-directory-phases.md): category is now
        // a joined place_categories.name (migration 0022), flattened here
        // so PlaceDetail's own category field and every render below it
        // stay unchanged. readEmbeddedName handles either embed shape
        // Postgrest may return, confirmed necessary by event-detail.tsx's
        // own existing places(name) embed coming back as an array despite
        // related_place_id being a plain single-value foreign key, the
        // same shape category_id has.
        //
        // Category Directory Expansion, Phase 1.3: facilities is now a
        // joined place_facilities[] via facility_ids (migration 0026), a
        // to-many relationship rather than the to-one category_id above.
        // Phase 3.3: the embed now also carries icon, not just name, so
        // the chip row below can render each facility's own icon --
        // flattened here directly into a {name, icon} row list rather than
        // through readEmbeddedNames (place-facilities.ts's plural helper),
        // since that helper only ever returns plain name strings and would
        // drop the icon. Same defensive array-or-single-object handling
        // place_categories gets just above, for the same Postgrest embed-
        // shape uncertainty.
        const { place_categories, place_facilities, ...rest } = data as typeof data & {
          place_categories: { name: string } | { name: string }[] | null;
          place_facilities: PlaceFacilityChip[] | PlaceFacilityChip | null;
        };
        let facilityRows: PlaceFacilityChip[];
        if (Array.isArray(place_facilities)) {
          facilityRows = place_facilities;
        } else if (place_facilities) {
          facilityRows = [place_facilities];
        } else {
          facilityRows = [];
        }
        setPlace({
          ...rest,
          category: readEmbeddedName(place_categories) ?? "",
          facilities: facilityRows,
        });
        setLoading(false);
      });

    // Map hover/full-details photos phase: every place_photos row for
    // this place, historical and current alike (photo_type is not
    // filtered here -- the gallery shows everything uploaded, the
    // historical/current split stays an admin-only organizing field, per
    // data-model.md this page has no separate historical-photos section
    // to route it into). Ordered by sort_order, same order admin-place-
    // detail.tsx's own photo manager already saves them in. Independent
    // request from the place fetch above (own .then, not chained), so a
    // slow or failed photo fetch never blocks the record itself from
    // rendering -- a fetch error here simply leaves photos empty, same
    // "absence is unremarkable" reasoning as PhotoGallery's own empty-
    // list return.
    supabase
      .from("place_photos")
      .select("photo_url")
      .eq("place_id", id)
      .order("sort_order", { ascending: true })
      .then(({ data: photoRows }) => {
        setPhotos((photoRows ?? []).map((row) => row.photo_url));
      });
  }, [id]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-6">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {place && <SaveButton placeId={place.id} />}
      </div>

      {loading && <p className="text-base text-muted-foreground">Loading…</p>}

      {!loading && notFound && (
        <p className="text-base text-muted-foreground">This place couldn&apos;t be found.</p>
      )}

      {!loading && place && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold text-foreground">{place.name}</h1>
            <p className="text-sm text-muted-foreground">{place.category}</p>
            {/* Location field, phase 6.1 (location-field-plan.md): address
                is a label filled from the pin, not a visit info block, so
                it sits here as a muted line, same style as the category
                line above it, rather than under entry #20's position
                rule. No heading, no icon. Hidden when empty. */}
            {place.address && (
              <p className="text-sm text-muted-foreground">{place.address}</p>
            )}
            <Badge variant="default" className="w-fit">
              Verified by Pasig Tourism Office
            </Badge>
          </div>

          {/* Map hover/full-details photos phase: every uploaded photo,
              right under the header/badge block and above the tabs -- the
              first thing a person sees after the name/category/badge,
              since it's the most visual content on the page and nothing
              else here competes for that position. Renders nothing when
              this place has no photos yet (PhotoGallery's own empty-list
              return), so a photo-less place's layout is unchanged from
              before this phase. */}
          <PhotoGallery photoUrls={photos} />

          {/* History tab phase: segmented Details / History control, same
              Tabs primitive discover.tsx already uses for map/list. Details
              keeps every visit-info block this page already had minus the
              long-form background text; History is new and holds that
              text plus the three historical fields that previously had no
              public render (historical_significance, year_or_period,
              source_reference). Defaults to Details, the visit-info tab a
              user coming from a marker or list row is most likely after. */}
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex flex-col gap-4">
              {place.description && (
                <p className="text-base text-foreground">{place.description}</p>
              )}

              {place.operating_hours && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Hours</h2>
                  <HoursDisplay value={place.operating_hours} />
                </div>
              )}

              {place.entrance_fee && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Entrance fee</h2>
                  <p className="text-base text-muted-foreground">{place.entrance_fee}</p>
                </div>
              )}

              {place.facilities.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="text-base font-semibold text-foreground">Facilities</h2>
                  <div className="flex flex-wrap gap-2">
                    {place.facilities.map((facility) => {
                      const Icon = getFacilityIcon(facility.icon);
                      return (
                        <Badge key={facility.name} variant="secondary" className="gap-2">
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          {facility.name}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rules (migration 0039, rules-field-plan.md): sits right
                  after Facilities, the last visit info block. One rule per
                  line in the form, so whitespace-pre-line keeps the line
                  breaks. Hidden when empty, same as the sections beside it. */}
              {place.rules && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Rules</h2>
                  <p className="whitespace-pre-line text-base text-muted-foreground">{place.rules}</p>
                </div>
              )}

              {!place.description &&
                !place.operating_hours &&
                !place.entrance_fee &&
                place.facilities.length === 0 &&
                !place.rules && (
                  <p className="text-base text-muted-foreground">No details listed yet.</p>
                )}
            </TabsContent>

            <TabsContent value="history" className="flex flex-col gap-4">
              {place.historical_background && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Historical background</h2>
                  <p className="text-base text-muted-foreground">{place.historical_background}</p>
                </div>
              )}

              {place.historical_significance && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Historical significance</h2>
                  <p className="text-base text-muted-foreground">{place.historical_significance}</p>
                </div>
              )}

              {place.year_or_period && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Year built or historical period</h2>
                  <p className="text-base text-muted-foreground">{place.year_or_period}</p>
                </div>
              )}

              {place.source_reference && (
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-foreground">Source or reference</h2>
                  <p className="text-base text-muted-foreground">{place.source_reference}</p>
                </div>
              )}

              {!place.historical_background &&
                !place.historical_significance &&
                !place.year_or_period &&
                !place.source_reference && (
                  <p className="text-base text-muted-foreground">No history has been added for this place yet.</p>
                )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
