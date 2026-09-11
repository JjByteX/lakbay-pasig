import { supabase } from "./supabase";

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
