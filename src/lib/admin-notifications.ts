import { supabase } from "./supabase";
import type { Profile } from "./auth-types";

// Admin/Staff notifications (feature-request-phases.md Phase 4). 4.1/4.2:
// "reflects the same numbers already shown on the Dashboard, not a new
// source of truth" -- this is admin-dashboard.tsx's own placesPending/
// businessesPending queries, moved here so admin.tsx's header can call the
// identical counts without importing a page component. Kept as two counts
// (not a merged total) since 4.4 lists "each queue with a pending count,"
// one row per queue, not one combined number.

export interface NotificationQueue {
  key: "places" | "businesses";
  label: string;
  count: number;
  route: string;
}

/**
 * 4.5: permission scoping. Mirrors admin-dashboard.tsx's own canPlaces/
 * canBusinesses gate exactly (isAdmin bypasses both, same as every other
 * permission check in this codebase) -- a staff member with only
 * review_businesses gets businesses back and places omitted entirely, not
 * a zeroed-out or greyed placeholder row, same Access Rule reasoning
 * admin-sidebar.tsx's own NAV_ITEMS filter already applies.
 */
export async function fetchNotificationQueues(profile: Profile | null): Promise<NotificationQueue[]> {
  const isAdmin = profile?.staff_role === "admin";
  const canPlaces = isAdmin || !!profile?.system_permission?.includes("manage_places");
  const canBusinesses = isAdmin || !!profile?.system_permission?.includes("review_businesses");

  // Both queues' queries fire together (same parallel-independent shape
  // admin-dashboard.tsx's own effect already uses for these two), rather
  // than businesses waiting on places to resolve first.
  const [placesQueue, businessesQueue] = await Promise.all([
    canPlaces ? fetchPlacesQueue() : Promise.resolve(null),
    canBusinesses ? fetchBusinessesQueue() : Promise.resolve(null),
  ]);

  return [placesQueue, businessesQueue].filter((q): q is NotificationQueue => q !== null);
}

// Same two-source sum as admin-dashboard.tsx's own placesPending effect:
// pending places plus flagged discovery_content ("Trail Content," reviewed
// through the same Places queue per admin-panel-spec.md's review
// exception), not a separate Trail Content number.
async function fetchPlacesQueue(): Promise<NotificationQueue> {
  const [placesRes, flaggedRes] = await Promise.all([
    supabase.from("places").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    supabase.from("discovery_content").select("id", { count: "exact", head: true }).eq("needs_place_review", true),
  ]);
  return {
    key: "places",
    label: "Places",
    count: (placesRes.count ?? 0) + (flaggedRes.count ?? 0),
    route: "/admin/places",
  };
}

async function fetchBusinessesQueue(): Promise<NotificationQueue> {
  const { count } = await supabase
    .from("businesses")
    .select("id", { count: "exact", head: true })
    .eq("verification_status", "pending");
  return { key: "businesses", label: "Businesses", count: count ?? 0, route: "/admin/businesses" };
}

export function totalPending(queues: NotificationQueue[]): number {
  return queues.reduce((sum, q) => sum + q.count, 0);
}
