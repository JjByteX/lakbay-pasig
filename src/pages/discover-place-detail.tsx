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
interface PlaceFacilityChip {
  name: string;
  icon: string;
}

interface PlaceDetail {
  id: string;
  name: string;
  category: string;
  description: string | null;
  historical_background: string | null;
  operating_hours: string | null;
  entrance_fee: string | null;
  facilities: PlaceFacilityChip[];
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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    supabase
      .from("places")
      .select(
        "id, name, description, historical_background, operating_hours, entrance_fee, verification_status, place_categories(name), place_facilities(name, icon)"
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
            <Badge variant="default" className="w-fit">
              Verified by Pasig Tourism Office
            </Badge>
          </div>

          {place.description && (
            <p className="text-base text-foreground">{place.description}</p>
          )}

          {place.historical_background && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">Historical background</h2>
              <p className="text-base text-muted-foreground">{place.historical_background}</p>
            </div>
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
        </div>
      )}
    </div>
  );
}
