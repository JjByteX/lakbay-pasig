import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SaveButton } from "@/components/public/save-button";

// Phase 6.3 (step-5-phases.md): full record fields from places (migration
// 0003), scoped through places_select_public, unchanged this step (verified
// only, a place has no Basic tier concept). Field list matches step-5-
// plan.md section 2 exactly: description, historical background, hours,
// entrance fee, facilities, plus name/category for the header and the
// verification badge every result already carries (navigation-and-access-
// control.md's v1 scope, no named contributor credit).
interface PlaceDetail {
  id: string;
  name: string;
  category: string;
  description: string | null;
  historical_background: string | null;
  operating_hours: string | null;
  entrance_fee: string | null;
  facilities: string[] | null;
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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    supabase
      .from("places")
      .select(
        "id, name, category, description, historical_background, operating_hours, entrance_fee, facilities, verification_status"
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
        setPlace(data as PlaceDetail);
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
              <p className="text-base text-muted-foreground">{place.operating_hours}</p>
            </div>
          )}

          {place.entrance_fee && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-foreground">Entrance fee</h2>
              <p className="text-base text-muted-foreground">{place.entrance_fee}</p>
            </div>
          )}

          {place.facilities && place.facilities.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-foreground">Facilities</h2>
              <div className="flex flex-wrap gap-2">
                {place.facilities.map((facility) => (
                  <Badge key={facility} variant="secondary">
                    {facility}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
