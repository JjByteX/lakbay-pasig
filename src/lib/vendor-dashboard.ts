import { supabase } from "./supabase";
import { readEmbeddedName } from "./place-categories";
import type { TrailInclusion } from "./vendor-types";

/**
 * Step 9, Phase 1.4: trail inclusion metric, per vendor-mode-spec.md's
 * Vendor Dashboard section ("Included in 3 active food crawls," not a
 * generic view/save count). Re-confirmed in Phase 0.2 that
 * route_stops_select_public (migration 0005) has no restrictive `to`
 * clause, gated only on the parent route's status = 'published', so a
 * signed-in vendor reading stops for their own business id needs no
 * policy change.
 *
 * Two step query, same shape trail-query.ts's own stop-name resolve and
 * saved-places.ts's fetchSavedPlaces already use: route_stops has no
 * embed-friendly foreign key back to routes worth relying on here (Phase
 * 0.2's re-read of 0005_routes.sql), so this reads route_stops first, then
 * the matching routes rows, merged client side. Count is `results.length`
 * at the call site, not a stored column, per architecture-notes.md's note
 * that Trails Included In is derived, never duplicated as stored data.
 */
export async function fetchTrailInclusions(businessId: string): Promise<TrailInclusion[]> {
  const { data: stopRows, error: stopError } = await supabase
    .from("route_stops")
    .select("route_id")
    .eq("stop_type", "business")
    .eq("stop_id", businessId);

  if (stopError) throw stopError;

  const routeIds = [...new Set((stopRows ?? []).map((row) => row.route_id))];
  if (routeIds.length === 0) return [];

  // Category Directory Phase 1.7: theme is now a joined trail_categories.
  // name (migration 0023), embedded and flattened, same pattern as
  // trail-query.ts's fetchPublishedTrails.
  const { data: routes, error: routesError } = await supabase
    .from("routes")
    .select("id, name, trail_categories(name)")
    .eq("status", "published")
    .in("id", routeIds);

  if (routesError) throw routesError;
  return (routes ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    theme: readEmbeddedName(row.trail_categories),
  }));
}
