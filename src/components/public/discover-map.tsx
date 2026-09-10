import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { Coordinates } from "@/lib/discover-query";
import type { DiscoverResult } from "@/lib/discover-types";
import { ResultCard } from "./result-card";

// Phase 8.1: tiles are their own loading concern, separate from the
// results query above them (a slow tile server on a fast query, or the
// reverse, are both real and independent cases). Bug found post-8.1: the
// original version listened for Leaflet's "load" event, which fires
// exactly once, the moment the map finishes its initial tile load. Since
// that can happen before this component's own useEffect runs and attaches
// the listener (a real race, not a hypothetical one, Leaflet does not
// replay a past event to a listener added after it already fired),
// tilesLoading could get stuck at its initial `true` forever with nothing
// left to ever flip it, which is exactly the "Loading map…" pill that
// never clears. map.whenReady() exists precisely for this: if the map is
// already loaded by the time it's called, the callback still fires (on
// the next tick), so there is no race to lose. "loading"/"load" are still
// used for the ongoing case (a later pan/zoom triggers a new tile load),
// whenReady only needs to cover the one-time initial case those two
// events already miss.
function TileLoadIndicator({ onChange }: { onChange: (loading: boolean) => void }) {
  const map = useMap();

  useEffect(() => {
    const handleLoading = () => onChange(true);
    const handleLoad = () => onChange(false);

    map.whenReady(handleLoad);
    map.on("loading", handleLoading);
    map.on("load", handleLoad);

    return () => {
      map.off("loading", handleLoading);
      map.off("load", handleLoad);
    };
  }, [map, onChange]);

  return null;
}

// Phase 4.1: default center when no location permission is granted.
// Approximate center of Pasig City, National Capital Region, Philippines.
const PASIG_CENTER: Coordinates = { latitude: 14.5764, longitude: 121.0851 };
const DEFAULT_ZOOM = 14;

// Phase 4.3: two marker treatments minimum, verified (places and
// businesses) versus pending business, so the pending visual distinction
// step-5-plan.md requires for the badge (Phase 6.1) is already anchored in
// the marker itself, not just the detail card. CSS-styled L.divIcon over a
// second set of raster marker images, reuses the same design tokens
// (primary, muted-foreground) every other component already reads from,
// per ux-ui-guidelines.md's Consistency Rules, no new one-off colors.
const verifiedIcon = L.divIcon({
  className: "",
  html: '<span class="block h-4 w-4 rounded-full border-2 border-card bg-primary shadow"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const pendingIcon = L.divIcon({
  className: "",
  html: '<span class="block h-4 w-4 rounded-full border-2 border-card bg-muted-foreground shadow"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function iconFor(result: DiscoverResult): L.DivIcon {
  return result.verification_status === "pending" ? pendingIcon : verifiedIcon;
}

// Phase 4.2: recenters the map imperatively once a user location resolves.
// react-leaflet's MapContainer only reads `center` on first mount, so
// moving the view after geolocation resolves needs the underlying Leaflet
// map instance via useMap, not a prop change.
function RecenterOnLocation({ location }: { location: Coordinates | null }) {
  const map = useMap();

  useEffect(() => {
    if (location) {
      map.setView([location.latitude, location.longitude], DEFAULT_ZOOM);
    }
  }, [location, map]);

  return null;
}

interface DiscoverMapProps {
  results: DiscoverResult[];
  userLocation: Coordinates | null;
  // Phase 8.1: query-in-flight, from discover.tsx's shared fetch. Distinct
  // from `tilesLoading` below, both are shown at once when they overlap.
  resultsLoading: boolean;
  // Phase 8.3: a specific message when the combined fetch failed outright,
  // distinct from a fetch that succeeded with zero rows (Phase 8.2's empty
  // state). Null when there is no error.
  resultsError: string | null;
}

/**
 * Phase 4.1-4.4, controlled since Phase 5: map view, full-bleed under the
 * shell's top bar, no card wrapper per ux-ui-guidelines.md (a map is not
 * card content). Centered on Pasig by default, recenters on `userLocation`
 * once resolved. `results` and `userLocation` are lifted to discover.tsx
 * as of Phase 5 (search and category filter, 5.3-5.4), since the list
 * surface needs the identical filtered set and the same location to sort
 * by, per step-5-plan.md's "narrows both map markers and the list
 * together" and Phase 5.2's "same result set... as markers." Geolocation
 * request itself also moved up for the same reason, one request, one
 * source of truth, not a second permission prompt from the list surface.
 * Renders one marker per result from the filtered set (4.3); tapping a
 * marker opens the shared result card (4.4), same component Phase 5's
 * list rows open (5.2).
 *
 * Phase 8.1 adds two independent loading signals on top of the above:
 * `resultsLoading` (the query, from discover.tsx) and `tilesLoading` (the
 * raster tiles themselves, tracked locally via TileLoadIndicator). Markers
 * depend on the former, the basemap depends on the latter, a slow query
 * and a slow tile server are unrelated failure/delay modes and neither
 * should be reported as the other. Phase 8.2 adds `isEmpty`, a completed
 * fetch with zero results. Phase 8.3 adds `resultsError`, a failed fetch;
 * it takes priority over both loading and empty, since a query that never
 * completed is a more severe condition than one that is still running or
 * one that ran and found nothing.
 */
export function DiscoverMap({ results, userLocation, resultsLoading, resultsError }: DiscoverMapProps) {
  const [selected, setSelected] = useState<DiscoverResult | null>(null);
  const [tilesLoading, setTilesLoading] = useState(true);
  // Phase 8.2: zero results after a completed fetch that did NOT error,
  // distinct from still loading (Phase 8.1) and from the fetch having
  // failed outright (Phase 8.3, checked first below). Mirrors discover-
  // list.tsx's own `sorted.length === 0` check, same underlying filtered
  // set, same "search or filter combination" cause.
  const isEmpty = !resultsError && !resultsLoading && !tilesLoading && results.length === 0;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[PASIG_CENTER.latitude, PASIG_CENTER.longitude]}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <TileLoadIndicator onChange={setTilesLoading} />
        <RecenterOnLocation location={userLocation} />
        {results
          .filter((result) => result.latitude != null && result.longitude != null)
          .map((result) => (
            <Marker
              key={`${result.kind}-${result.id}`}
              position={[result.latitude as number, result.longitude as number]}
              icon={iconFor(result)}
              eventHandlers={{ click: () => setSelected(result) }}
            />
          ))}
      </MapContainer>

      {/* Phase 8.1's loading pill, Phase 8.2's empty-state pill, and Phase
          8.3's error pill share the same top-of-map slot and z-index
          rather than stacking separate overlays, per ux-ui-guidelines.md's
          State Rules, one state communicated at a time. Error takes
          priority over loading and empty (a failed fetch is a more severe,
          more specific condition than either "still waiting" or "completed
          with nothing to show," and `isEmpty` above already excludes the
          error case so the two pills below it never compete). Empty only
          appears once both loading flags have resolved with no error and
          the filtered set is still zero, matching discover-list.tsx's own
          "no results" wording exactly (same filtered set, per step-5-
          plan.md's "narrows both map markers and the list together," so
          the two surfaces should never disagree about whether the current
          search/filter combination has results, or whether it errored).
          The map itself stays interactive under any of these three pills
          (no overlay blocking pan/zoom), unlike the list's full-body swap,
          since a person may still want to look around manually, per
          navigation-and-access-control.md's "search and view" pattern
          this screen is built around. z-[1000] on every pill clears
          Leaflet's own pane stack (its panes sit in the 200-650 range),
          matching the z-index this codebase's other floating-over-map
          elements (ResultCard's Dialog) already need to clear. */}
      {resultsError ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-6">
          {/* text-destructive on the message only, same convention this
              codebase's other error messages already use (e.g. admin-
              staff-detail.tsx's notFound branch), the pill's own border/
              background stay identical to the loading and empty pills, so
              only the text signals severity, not a second container style
              invented for this one case. Phase 8.4 fix: max-w-full plus
              the wrapping div's own px-6 keeps a long error message (this
              one's length isn't fixed like the loading/empty copy, it
              comes from whatever Supabase or the network actually reports)
              from stretching past the viewport at narrow widths; no
              whitespace-nowrap here means it wraps onto a second line
              instead, rather than overflowing horizontally. */}
          <span className="max-w-full break-words rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-destructive shadow">
            {resultsError}
          </span>
        </div>
      ) : (
        <>
          {(resultsLoading || tilesLoading) && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-6">
              <span className="max-w-full break-words rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-muted-foreground shadow">
                {resultsLoading ? "Loading places and businesses…" : "Loading map…"}
              </span>
            </div>
          )}

          {isEmpty && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-6">
              <span className="max-w-full break-words rounded-full border border-border bg-card px-3 py-1 text-center text-xs text-muted-foreground shadow">
                No results match your search and filters.
              </span>
            </div>
          )}
        </>
      )}

      <ResultCard result={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
