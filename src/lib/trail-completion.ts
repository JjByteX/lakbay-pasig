import { supabase } from "./supabase";

/**
 * Step 7, Phase 5.1-5.2: completion writes, own file matching every other
 * table in this domain (trail-progress.ts, saved-routes.ts, saved-
 * places.ts), per constraints.md's Inventory Before Suggesting rule --
 * trail-detail.tsx never calls supabase directly anywhere else, every
 * write already routes through a src/lib/*.ts file scoped to its own
 * table(s), this stays consistent rather than becoming the one exception.
 *
 * completed_routes and user_credentials (migration 0007) are both
 * personal-record tables the signed-in user already owns write access to
 * (completed_routes_own, user_credentials_own), no staff involvement
 * anywhere in this path, per admin-panel-spec.md's Trail Publishing
 * section (no second reviewer on the player-facing completion path
 * either). Both are cohort-stat sources only per the same migration's own
 * comment and competitive-positioning.md -- this file only ever inserts,
 * it has no read function, since no per-user ranking or "your Nth visit"
 * query should exist to read them back that way.
 */

/**
 * Whether the signed-in user has already completed this route. Same
 * existence-check shape as saved-routes.ts's isRouteSaved: a personal
 * yes/no over the caller's own row, not a count or a rank, so it doesn't
 * conflict with this file's own no-cohort-query stance above. Used to
 * drive trail-stop.tsx's completed state and to gate 5.1's last-stop
 * detection so a trail already finished on a prior visit doesn't try to
 * insert a second completed_routes row from a later proximity re-check.
 *
 * Note for callers: trail-detail.tsx's Phase 5.4 restart flow
 * deliberately does NOT delete the completed_routes row this function
 * reads, but does locally override its own `completed` state back to
 * false after a restart so the trail renders as in-progress again. This
 * function still always reflects DB truth (a completion event log entry
 * genuinely exists), the divergence is intentional and lives entirely in
 * the caller's local state, not here.
 */
export async function isRouteCompleted(userId: string, routeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("completed_routes")
    .select("id")
    .eq("user_id", userId)
    .eq("route_id", routeId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/**
 * step-7-phases.md's 5.2: "Insert into completed_routes ... If the route
 * has a trail_credentials row ... insert into user_credentials too."
 * credentialId is optional since not every route has a linked credential
 * (TrailDetail.credential is nullable, trail-types.ts), the caller passes
 * trail.credential?.id straight through rather than this function
 * re-deriving it. Two inserts, not a single RPC/transaction: both tables
 * are independently owner-writable rows with no foreign key between them
 * requiring atomicity, and a partial failure (completed_routes succeeds,
 * user_credentials fails) still leaves the trail correctly marked
 * complete, which matters more than an all-or-nothing guarantee here.
 */
export async function completeTrail(userId: string, routeId: string, credentialId?: string): Promise<void> {
  const { error: completedError } = await supabase
    .from("completed_routes")
    .insert({ user_id: userId, route_id: routeId });
  if (completedError) throw completedError;

  if (!credentialId) return;

  const { error: credentialError } = await supabase
    .from("user_credentials")
    .insert({ user_id: userId, credential_id: credentialId });
  if (credentialError) throw credentialError;
}
