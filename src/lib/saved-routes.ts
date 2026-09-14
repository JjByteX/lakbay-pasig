import { supabase } from "./supabase";
import type { TrailSummary } from "./trail-types";
import { fetchRouteSummariesByIds } from "./trail-query";

/**
 * Step 7, Phase 1.6: saved_routes (migration 0007, owner-only RLS via
 * saved_routes_own), mirrors saved-places.ts exactly, per step-7-trail-
 * plan.md's Data Layer section ("New src/lib/saved-routes.ts for the
 * save action, matching saved-places.ts, no saved-route component exists
 * yet either"). Swapped: place_id -> route_id, saved_places -> saved_routes.
 * Same reasoning as saved-places.ts's own file comment applies here in
 * reverse, saved_routes has no type-plus-id pattern either, it has a
 * direct route_id foreign key (references public.routes(id)), a route is
 * the only thing this table ever points at.
 */

export async function isRouteSaved(userId: string, routeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("saved_routes")
    .select("id")
    .eq("user_id", userId)
    .eq("route_id", routeId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/**
 * Signed-in tap inserts or deletes the row directly, same reversible-
 * personal-action reasoning as saved-places.ts's toggleSavedPlace, no
 * confirmation modal needed. Returns the new saved state so the caller
 * can update its own UI without a second round-trip read.
 */
export async function toggleSavedRoute(
  userId: string,
  routeId: string,
  currentlySaved: boolean
): Promise<boolean> {
  if (currentlySaved) {
    const { error } = await supabase
      .from("saved_routes")
      .delete()
      .eq("user_id", userId)
      .eq("route_id", routeId);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("saved_routes")
    .insert({ user_id: userId, route_id: routeId });
  if (error) throw error;
  return true;
}

/**
 * Step 8, Phase 1.3: saved-routes list, Saved page's Saved Trails section.
 * Same two step shape fetchSavedPlaces uses in saved-places.ts: this
 * user's saved_routes rows first (saved_routes_own), then the matching
 * routes rows, merged client side. Credential name resolved with
 * trail-query.ts's exported fetchCredentialNamesByRouteId rather than a
 * second copy of the same lookup, per constraints.md's Inventory Before
 * Suggesting rule.
 *
 * Returns TrailSummary, not a new type: a saved trail renders exactly
 * like a catalog trail everywhere except the Saved page itself, which
 * only adds a heart control and a different tap target, not a different
 * data shape. trail-card.tsx (Step 7) needs no changes to render this.
 *
 * Route-id-to-TrailSummary resolution (embed-and-flatten select plus
 * credential-name lookup) is trail-query.ts's exported
 * fetchRouteSummariesByIds, shared with trail-completion.ts's
 * fetchCompletedRoutes rather than kept as a second copy here, per
 * constraints.md's Inventory Before Suggesting rule.
 */
export async function fetchSavedRoutes(userId: string): Promise<TrailSummary[]> {
  const { data: savedRows, error: savedError } = await supabase
    .from("saved_routes")
    .select("route_id")
    .eq("user_id", userId);

  if (savedError) throw savedError;
  const routeIds = (savedRows ?? []).map((row) => row.route_id);

  return fetchRouteSummariesByIds(routeIds);
}
