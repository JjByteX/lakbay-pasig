import { supabase } from "./supabase";
import type { TrailSummary } from "./trail-types";
import { fetchCredentialNamesByRouteId } from "./trail-query";

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
 * comment and competitive-positioning.md.
 *
 * Step 8, Phase 1.1 update: this file originally had no read function at
 * all, on the reasoning that no per-user ranking or "your Nth visit"
 * query should exist to read completed_routes back. fetchCompletedRoutes
 * below does not change that stance, it still never counts, ranks, or
 * compares across users. It reads one signed-in user's own rows only, for
 * the Saved page's Completed Trails section, the same "personal record,
 * not a cohort stat" shape isRouteCompleted below already uses for its
 * own read. A list of your own finished trails is the personal-record
 * case navigation-and-access-control.md's Saved tab describes, not the
 * leaderboard case this file was written to keep out.
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

/**
 * Step 8, Phase 1.1: completed-trails list, Saved page's Completed Trails
 * section. Same two step shape fetchSavedRoutes uses in saved-routes.ts:
 * this user's completed_routes rows first (completed_routes_own, one
 * user's own rows only, per this file's header comment above), then the
 * matching routes rows, merged client side, plus this file's own
 * completed_at column carried straight through. Credential name resolved
 * with trail-query.ts's exported fetchCredentialNamesByRouteId, same
 * lookup fetchSavedRoutes already reuses, not a third copy of it.
 *
 * Returns TrailSummary & { completed_at }, not a new type: a completed
 * trail is a TrailSummary plus exactly one extra fact, when it was
 * finished. No count, no rank, no "Nth person" framing anywhere in this
 * function, matching this file's own header comment and
 * competitive-positioning.md.
 */
export async function fetchCompletedRoutes(
  userId: string
): Promise<(TrailSummary & { completed_at: string })[]> {
  const { data: completedRows, error: completedError } = await supabase
    .from("completed_routes")
    .select("route_id, completed_at")
    .eq("user_id", userId);

  if (completedError) throw completedError;
  const rows = completedRows ?? [];
  if (rows.length === 0) return [];

  const completedAtByRouteId = new Map(rows.map((row) => [row.route_id, row.completed_at]));
  const routeIds = rows.map((row) => row.route_id);

  const { data: routes, error: routesError } = await supabase
    .from("routes")
    .select("id, name, theme, estimated_duration, estimated_budget, run_type")
    .in("id", routeIds);

  if (routesError) throw routesError;
  const routeRows = routes ?? [];

  const credentialNames = await fetchCredentialNamesByRouteId(routeRows.map((r) => r.id));

  return routeRows.map((row) => ({
    id: row.id,
    name: row.name,
    theme: row.theme,
    estimated_duration: row.estimated_duration,
    estimated_budget: row.estimated_budget,
    run_type: row.run_type,
    credentialName: credentialNames.get(row.id) ?? null,
    completed_at: completedAtByRouteId.get(row.id) ?? "",
  }));
}
