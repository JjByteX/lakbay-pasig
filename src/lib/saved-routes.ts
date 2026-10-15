import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { TrailSummary } from "./trail-types";
import { fetchPublishedTrails, fetchRouteSummariesByIds } from "./trail-query";
import { readSaved, replaceSaved } from "./offline/mine";
import { readIsSaved, settle, writeSaved } from "./offline/queue";
import { failReason } from "./offline/rules";

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

// Phase 8 (offline-phases.md): reads and writes go through offline/queue.ts,
// same as saved-places.ts. A copy on the device answers offline, and a save or
// unsave made offline is queued.
export async function isRouteSaved(userId: string, routeId: string): Promise<boolean> {
  return readIsSaved(userId, "route", routeId, async () => {
    const { data, error } = await supabase
      .from("saved_routes")
      .select("id")
      .eq("user_id", userId)
      .eq("route_id", routeId)
      .maybeSingle();

    if (error) throw error;
    return data !== null;
  });
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
  return writeSaved("route", userId, routeId, !currentlySaved, async () => {
    if (currentlySaved) {
      const { error } = await supabase
        .from("saved_routes")
        .delete()
        .eq("user_id", userId)
        .eq("route_id", routeId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from("saved_routes")
      .insert({ user_id: userId, route_id: routeId });
    if (error) throw error;
  });
}

// Offline: the saved ids kept on this device, joined in memory with the trail
// list the Pasig download holds. Without a copy of the ids, the original error
// stands.
async function savedRoutesOffline(userId: string, cause: PostgrestError): Promise<TrailSummary[]> {
  const ids = await readSaved(userId, "route");
  if (!ids) throw cause;
  if (ids.size === 0) return [];
  const trails = await fetchPublishedTrails();
  return trails.filter((trail) => ids.has(trail.id));
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
  await settle(userId);
  const { data: savedRows, error: savedError } = await supabase
    .from("saved_routes")
    .select("route_id")
    .eq("user_id", userId);

  if (savedError) {
    if (failReason(savedError) === "network") return savedRoutesOffline(userId, savedError);
    throw savedError;
  }
  const routeIds = (savedRows ?? []).map((row) => row.route_id);
  await replaceSaved(userId, "route", routeIds);

  return fetchRouteSummariesByIds(routeIds);
}
