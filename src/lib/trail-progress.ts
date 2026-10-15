import { supabase } from "./supabase";
import { readRouteProgress, writeReset, writeStop } from "./offline/queue";

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

// Phase 8 (offline-phases.md): reads and writes go through offline/queue.ts.
// Online they behave as before and keep a copy on the device. Offline the read
// answers from that copy, and a Start or a stop unlock is queued and replays
// when the connection returns.
export async function getRouteProgress(userId: string, routeId: string): Promise<RouteProgress | null> {
  return readRouteProgress(userId, routeId, async () => {
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
  });
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
 *
 * `sequenceOrder` is the stop's sequence_order. The server never sees it: it is
 * how a queued write keeps the highest stop when several wait (queue-rules.ts).
 */
export async function unlockStop(
  userId: string,
  routeId: string,
  stopId: string,
  sequenceOrder: number
): Promise<void> {
  await writeStop(userId, routeId, stopId, sequenceOrder, async (at) => {
    const { error } = await supabase.from("route_progress").upsert(
      {
        user_id: userId,
        route_id: routeId,
        highest_unlocked_stop_id: stopId,
        unlocked_at: at,
      },
      { onConflict: "user_id,route_id" }
    );

    if (error) throw error;
  });
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
  // Restart stays an online action: offline it fails like any failed write, and
  // the copy on the device follows once the server has deleted the row.
  await writeReset(userId, routeId, async () => {
    const { error } = await supabase
      .from("route_progress")
      .delete()
      .eq("user_id", userId)
      .eq("route_id", routeId);

    if (error) throw error;
  });
}
