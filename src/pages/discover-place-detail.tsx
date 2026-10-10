import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Info } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { readEmbeddedName } from "@/lib/place-categories";
import {
  BARANGAY_HALL_CATEGORY,
  barangayForPin,
  fetchPublishedFiestasForBarangay,
  type PublicFiesta,
} from "@/lib/fiestas";
import { fetchActiveCategories as fetchActiveFacilities, type PlaceFacility } from "@/lib/place-facilities";
import { getFacilityIcon } from "@/lib/place-facility-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerificationBadge } from "@/components/public/result-card";
import { PageDirectionsButton } from "@/components/public/page-directions-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SaveButton } from "@/components/public/save-button";
import { HoursDisplay } from "@/components/public/hours-display";
import { PhotoGallery } from "@/components/public/photo-gallery";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageContainer } from "@/components/public/page-container";
import { RecommendationRow } from "@/components/public/recommendation-row";
import { useUserLocation } from "@/components/public/public-shell";
import { distanceAway, joinMeta } from "@/lib/distance-label";
import { usePageTitle } from "@/lib/page-title";
import { useDiscoverBack } from "@/lib/discover-memory";
import { cn } from "@/lib/utils";

// Phase 6.3 (step-5-phases.md): full record fields from places (migration
// 0003), scoped through places_select_public, unchanged this step (verified
// only, a place has no Basic tier concept). Field list matches step-5-
// plan.md section 2 exactly: description, historical background, hours,
// entrance fee, facilities, plus name/category for the header and the
// verification badge every result already carries (navigation-and-access-
// control.md's v1 scope, no named contributor credit).
//
// Category Directory Expansion, Phase 1.3: facilities is now
// places.facility_ids (migration 0026, a uuid[] replacing the old
// places.facilities text[]) resolved against the place_facilities
// directory client-side, the same pattern admin-place-detail.tsx uses --
// PostgREST has no foreign-key relationship to embed here, since
// facility_ids is a plain array column, not a join table.
//
// Phase 3.3: the chip row's own scope now explicitly changes, gaining an
// icon beside each facility name (matching Discover's place category
// chips), so each row also carries the facility's icon, not just its name.
//
// Fiesta tab (migrations 0044 and 0045): a place in the Barangay Hall
// category gets a third segment, Fiesta, beside Details and History. Which
// barangay's fiestas it shows is computed from the pin (barangay.ts,
// decision #21), not stored on the place, so staff enter a fiesta once in
// Fiestas and every hall page picks it up. Published fiestas only. Every
// other category's page is unchanged.
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
interface PlaceDetail {
  id: string;
  name: string;
  category: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  historical_background: string | null;
  historical_significance: string | null;
  year_or_period: string | null;
  source_reference: string | null;
  operating_hours: string | null;
  entrance_fee: string | null;
  facility_ids: string[];
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
  const goBack = useDiscoverBack();
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
  // "350 m away" on the category line, from the live location. Hidden without
  // a fix or a pin.
  const { userLocation } = useUserLocation();
  // place_facilities has no foreign-key relationship PostgREST can embed
  // on places (facility_ids is a plain uuid[] column, migration 0026), so
  // the facility directory is fetched separately here and matched against
  // facility_ids client-side -- the same pattern admin-place-detail.tsx
  // already uses for this exact relationship.
  const [allFacilities, setAllFacilities] = useState<PlaceFacility[]>([]);
  // Fiesta tab: null while loading, [] when the barangay has none published
  // (or the pin falls outside every barangay, or the lookup failed -- all
  // read the same to a resident, so one empty state).
  const [fiestas, setFiestas] = useState<PublicFiesta[] | null>(null);
  // The tab the visitor picked. The tab actually shown falls back to the first
  // one that has content (activeTab below), so it never points at a hidden one.
  const [chosenTab, setChosenTab] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveFacilities()
      .then(setAllFacilities)
      .catch(() => setAllFacilities([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    supabase
      .from("places")
      .select(
        "id, name, address, latitude, longitude, description, historical_background, historical_significance, year_or_period, source_reference, operating_hours, entrance_fee, rules, verification_status, place_categories(name), facility_ids"
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
        // Category Directory Expansion, Phase 1.3: facility_ids (migration
        // 0026) is a plain uuid[] column, not embeddable via PostgREST
        // (no foreign-key relationship exists for it), so it's read here
        // as-is and resolved against the facility directory (fetched in
        // the effect above) by the placeFacilities lookup near the return
        // statement -- same client-side match admin-place-detail.tsx uses
        // for the same relationship.
        const { place_categories, ...rest } = data as typeof data & {
          place_categories: { name: string } | { name: string }[] | null;
        };
        setPlace({
          ...rest,
          category: readEmbeddedName(place_categories) ?? "",
          facility_ids: rest.facility_ids ?? [],
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

  const showFiestaTab = place?.category === BARANGAY_HALL_CATEGORY;

  useEffect(() => {
    setFiestas(null);
    if (place?.category !== BARANGAY_HALL_CATEGORY) return;
    if (place.latitude === null || place.longitude === null) {
      setFiestas([]);
      return;
    }
    let cancelled = false;
    barangayForPin(place.latitude, place.longitude)
      .then((name) => (name ? fetchPublishedFiestasForBarangay(name) : []))
      .then((rows) => {
        if (!cancelled) setFiestas(rows);
      })
      .catch(() => {
        if (!cancelled) setFiestas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [place]);

  // Resolves this place's facility_ids against the fetched facility
  // directory, same client-side match admin-place-detail.tsx does for its
  // own facility chip row.
  const placeFacilities: PlaceFacility[] = place
    ? allFacilities.filter((facility) => place.facility_ids.includes(facility.id))
    : [];

  // A tab exists only when it has something to show, so nobody taps into an
  // empty panel. Fiesta waits for its fetch before it counts. When no tab has
  // content, one empty state with a way back replaces the whole block (below),
  // except while the fiesta fetch could still add a tab.
  const hasDetails =
    place !== null &&
    Boolean(place.description || place.operating_hours || place.entrance_fee || placeFacilities.length > 0 || place.rules);
  const hasHistory =
    place !== null &&
    Boolean(place.historical_background || place.historical_significance || place.year_or_period || place.source_reference);
  const hasFiesta = showFiestaTab && fiestas !== null && fiestas.length > 0;
  const fiestaPending = showFiestaTab && fiestas === null;
  const tabs: { value: string; label: string }[] = [];
  if (hasDetails) tabs.push({ value: "details", label: "Details" });
  if (hasHistory) tabs.push({ value: "history", label: "History" });
  if (hasFiesta) tabs.push({ value: "fiesta", label: "Fiesta" });
  const activeTab = tabs.find((tab) => tab.value === chosenTab)?.value ?? tabs[0]?.value ?? "details";

  // xl+: info and tabs in the wide left column, photos in a narrower sticky
  // column on the right (Wikipedia's infobox layout: text leads, the picture
  // supports it). No photos -> single narrow column.
  const hasPhotos = photos.length > 0;

  return (
    <PageContainer width={hasPhotos ? "detail" : "narrow"}>
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {place && <SaveButton itemId={place.id} />}
      </div>

      {loading && <p className="text-base text-muted-foreground">Loading…</p>}

      {!loading && notFound && (
        <p className="text-base text-muted-foreground">This place couldn&apos;t be found.</p>
      )}

      {!loading && place && (
        <div className={cn("flex flex-col gap-4", hasPhotos && "xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[auto_1fr] xl:items-start xl:gap-x-8")}>
          <div className="flex flex-col gap-2 xl:col-start-1 xl:row-start-1">
            <h1 className="text-xl font-semibold text-foreground">{place.name}</h1>
            <p className="text-sm text-muted-foreground">
              {joinMeta([place.category, distanceAway(userLocation, place.latitude, place.longitude)])}
            </p>
            {/* Location field, phase 6.1 (location-field-plan.md): address
                is a label filled from the pin, not a visit info block, so
                it sits here as a muted line, same style as the category
                line above it, rather than under entry #20's position
                rule. No heading, no icon. Hidden when empty. */}
            {place.address && (
              <p className="text-sm text-muted-foreground">{place.address}</p>
            )}
            {/* Same seal-check badge as the map preview's modal. */}
            <VerificationBadge status={place.verification_status} />
            {/* Directions, same as the preview modal; the full page lost it. */}
            <PageDirectionsButton
              result={{
                kind: "place",
                id: place.id,
                name: place.name,
                category: place.category,
                categoryIcon: null,
                categoryColor: null,
                description: place.description,
                latitude: place.latitude,
                longitude: place.longitude,
                verification_status: place.verification_status,
                facility_ids: place.facility_ids,
                coverPhotoUrl: photos[0] ?? null,
              }}
            />
          </div>

          {/* Map hover/full-details photos phase: every uploaded photo,
              right under the header/badge block and above the tabs -- the
              first thing a person sees after the name/category/badge,
              since it's the most visual content on the page and nothing
              else here competes for that position. Renders nothing when
              this place has no photos yet (PhotoGallery's own empty-list
              return), so a photo-less place's layout is unchanged from
              before this phase. */}
          <PhotoGallery photoUrls={photos} className="xl:sticky xl:top-6 xl:col-start-2 xl:row-span-2 xl:row-start-1" />

          {/* History tab phase: segmented Details / History control, same
              Tabs primitive discover.tsx already uses for map/list. Details
              keeps every visit-info block this page already had minus the
              long-form background text; History is new and holds that
              text plus the three historical fields that previously had no
              public render (historical_significance, year_or_period,
              source_reference). Defaults to Details, the visit-info tab a
              user coming from a marker or list row is most likely after. */}
          {tabs.length === 0 && !fiestaPending && (
            <div className="xl:col-start-1 xl:row-start-2">
              <EmptyState
                icon={Info}
                className="text-base"
                action={
                  <Button variant="outline" onClick={goBack}>
                    Back to Discover
                  </Button>
                }
              >
                Details will appear here.
              </EmptyState>
            </div>
          )}

          <Tabs
            value={activeTab}
            onValueChange={setChosenTab}
            className={cn("xl:col-start-1 xl:row-start-2", tabs.length === 0 && "hidden")}
          >
            {tabs.length > 1 && (
              <TabsList className={cn("grid w-full", tabs.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}

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

              {placeFacilities.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="text-base font-semibold text-foreground">Facilities</h2>
                  <div className="flex flex-wrap gap-2">
                    {placeFacilities.map((facility) => {
                      const Icon = getFacilityIcon(facility.icon);
                      return (
                        <Badge key={facility.id} variant="secondary" className="gap-2">
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
            </TabsContent>

            {showFiestaTab && (
              <TabsContent value="fiesta" className="flex flex-col gap-4">
                {fiestas?.map((fiesta) => (
                  <div key={fiesta.id} className="flex flex-col gap-1">
                    <Link
                      to={`/fiestas/${fiesta.id}`}
                      className="w-fit text-base font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      {fiesta.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {[fiesta.date_label, fiesta.patron_saint].filter(Boolean).join(" · ")}
                    </p>
                    {fiesta.description && <p className="text-base text-muted-foreground">{fiesta.description}</p>}
                  </div>
                ))}
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}

      {/* Similar (recommendation-plan.md, Scope): after the whole grid, full
          width, so the xl sticky gallery column is not disturbed. Places and
          businesses mixed in one row, this place left out. Guests see it too,
          the hide control only shows when signed in. Renders nothing when
          empty or on error. */}
      {!loading && place && <RecommendationRow anchor={{ kind: "place", id: place.id }} title="Similar" />}
    </PageContainer>
  );
}
