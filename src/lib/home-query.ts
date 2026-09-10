import { supabase } from "./supabase";
import type { Announcement, RecentlyVerifiedBusiness, RecentlyVerifiedItem, RecentlyVerifiedPlace } from "./home-types";

// Phase 2.2 (step-6-phases.md): "Feed of published announcements," per
// navigation-and-access-control.md's Home tab definition. The .eq() below
// is required, not just defensive: events_select_staff (migration 0006)
// has no published check at all, it grants full-table read to anyone with
// publish_events or the admin role. Nothing stops a CATO Staff account
// from browsing the public Home tab (PublicShell has no staff gate), and
// profiles.role/staff_role live on one row per account, no dual-role
// split, so that account's own SELECT on events would return drafts too
// under RLS alone. The explicit .eq("published", true) here is an
// additional AND-ed condition on top of whatever RLS lets through, so it
// holds regardless of which policy matched the caller. Newest first, per
// Home's "what's new" framing (navigation-and-access-control.md).
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, category, date_time, location, related_place_id")
    .eq("published", true)
    .order("date_time", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Phase 2.3: places (places_select_public, verified only) and businesses
// (businesses_select_public, verified or pending) fetched separately, same
// split discover-query.ts's fetchPlaces/fetchBusinesses already use, since
// RLS differs by table. Only verified businesses belong in "recently
// verified," so this filters on verification_status = 'verified' itself
// rather than reusing fetchBusinesses' full verified-or-pending set.
// Field list matches discover-query.ts's own summary shape (id, name,
// category, description, coordinates) plus verified_at (migration 0017),
// which Discover's query has no reason to select.
async function fetchRecentlyVerifiedPlaces(): Promise<RecentlyVerifiedPlace[]> {
  const { data, error } = await supabase
    .from("places")
    .select("id, name, category, description, latitude, longitude, verification_status, verified_at")
    .not("verified_at", "is", null)
    .order("verified_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    kind: "place" as const,
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    verification_status: row.verification_status as "verified",
    verified_at: row.verified_at as string,
  }));
}

async function fetchRecentlyVerifiedBusinesses(): Promise<RecentlyVerifiedBusiness[]> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, category, description, latitude, longitude, verification_status, verified_at, business_items(price)")
    .eq("verification_status", "verified")
    .not("verified_at", "is", null)
    .order("verified_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    kind: "business" as const,
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    verification_status: "verified" as const,
    itemPrices: (row.business_items ?? []).map((item: { price: number | null }) => item.price),
    verified_at: row.verified_at as string,
  }));
}

/**
 * Phase 2.3: both kinds fetched with a 10-row cap each, then merged and
 * re-sorted by verified_at so the combined top 10 is correct regardless of
 * which table contributed more recent rows, then capped again at 10. A
 * fetch-then-cap-per-table approach (rather than one combined query) is
 * required here, unlike Discover's fetchDiscoverResults, since places and
 * businesses are different tables with no single query that spans both.
 * Rows verified before migration 0017's backfill or before this feature
 * existed still carry a verified_at value (the backfill set it from
 * updated_at at migration time), so nothing verified pre-launch is
 * silently excluded from this list.
 */
export async function fetchRecentlyVerified(): Promise<RecentlyVerifiedItem[]> {
  const [places, businesses] = await Promise.all([
    fetchRecentlyVerifiedPlaces(),
    fetchRecentlyVerifiedBusinesses(),
  ]);

  return [...places, ...businesses]
    .sort((a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime())
    .slice(0, 10);
}
