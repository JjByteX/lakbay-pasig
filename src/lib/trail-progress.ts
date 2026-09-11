import { supabase } from "./supabase";

/**
 * Step 7, Phase 1.5: route_progress (migration 0018, owner-only RLS via
 * route_progress_own) reads and writes, mirroring saved-places.ts's
 * shape per step-7-trail-plan.md's Data Layer section. One row per user
 * per route (unique (user_id, route_id), migration 0018), not a row per
 * unlock event, so "unlocking a stop" is always an upsert on that pair,
 * never a plain insert, unlike saved_places's toggle which only ever
 * inserts or deletes a whole row.
 */

export interface RouteProgress {
  highestUnlockedStopId: string;
  unlockedAt: string;
}

export async function getRouteProgress(userId: string, routeId: string): Promise<RouteProgress | null> {
  const { data, error } = await supabase
    .from("route_progress")
    .select("highest_unlocked_stop_id, unlocked_at")
    .eq("user_id", userId)
    .eq("route_id", routeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    highestUnlockedStopId: data.highest_unlocked_stop_id,
    unlockedAt: data.unlocked_at,
  };
}

/**
 * Starts a trail, or advances it: upserts on (user_id, route_id), the
 * same pair migration 0018's unique constraint covers, so calling this
 * for a route the user has no progress on yet creates the row (Start),
 * and calling it again for a later stop overwrites the same row in
 * place (each subsequent unlock) rather than accumulating one row per
 * stop. `unlocked_at` is refreshed to now() on every call, matching the
 * column's role as "when the current highest stop was reached," not a
 * fixed start timestamp.
 */
export async function unlockStop(userId: string, routeId: string, stopId: string): Promise<void> {
  const { error } = await supabase.from("route_progress").upsert(
    {
      user_id: userId,
      route_id: routeId,
      highest_unlocked_stop_id: stopId,
      unlocked_at: new Date().toISOString(),
    },
    { onConflict: "user_id,route_id" }
  );

  if (error) throw error;
}

/**
 * Step-7-trail-plan.md's Schema Change First section: "Deleted or reset
 * if the user abandons a trail and restarts it." A plain delete, not a
 * reset-to-first-stop update, since a deleted row and a never-started
 * row are the same state for every reader of this table (getRouteProgress
 * returns null either way), no reason to keep a row around with a
 * first-stop value when "no row" already means exactly that.
 */
export async function resetRouteProgress(userId: string, routeId: string): Promise<void> {
  const { error } = await supabase
    .from("route_progress")
    .delete()
    .eq("user_id", userId)
    .eq("route_id", routeId);

  if (error) throw error;
}
