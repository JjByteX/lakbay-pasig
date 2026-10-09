import { supabase } from "@/lib/supabase";

/**
 * Publish gate for a place's or business's own entries
 * (docs/discovery-content-plan.md).
 *
 * A trail note carries its trail's route_id, so the gate finds it by trail.
 * A place entry has no route_id, so the gate finds it through the place or
 * business that is a stop in the trail. Both use the flag migration 0012
 * computes (needs_place_review), which this app never sets. Migration 0053
 * clears it by itself: a place entry follows its place, a business entry
 * follows its latest review. Inactive entries are skipped, since visitors
 * never see them.
 */
export type StopLocationType = "place" | "business";

export interface FlaggedPlaceEntry {
  id: string;
  title: string;
  locationType: StopLocationType;
  locationId: string;
}

export function stopLocationKey(type: StopLocationType, id: string): string {
  return `${type}:${id}`;
}

async function fetchFlaggedFor(type: StopLocationType, ids: string[]) {
  if (ids.length === 0) return { data: [], error: null };
  return supabase
    .from("discovery_content")
    .select("id, title, related_location_id")
    .is("route_id", null)
    .eq("related_location_type", type)
    .in("related_location_id", ids)
    .eq("status", "active")
    .eq("needs_place_review", true)
    .order("id", { ascending: true });
}

export async function fetchFlaggedPlaceEntries(
  placeIds: string[],
  businessIds: string[]
): Promise<{ entries: FlaggedPlaceEntry[] } | { error: string }> {
  const [places, businesses] = await Promise.all([
    fetchFlaggedFor("place", placeIds),
    fetchFlaggedFor("business", businessIds),
  ]);

  const failed = places.error ?? businesses.error;
  if (failed) return { error: failed.message };

  const toEntries = (rows: { id: string; title: string; related_location_id: string }[], type: StopLocationType) =>
    rows.map((row) => ({ id: row.id, title: row.title, locationType: type, locationId: row.related_location_id }));

  return {
    entries: [...toEntries(places.data ?? [], "place"), ...toEntries(businesses.data ?? [], "business")],
  };
}
