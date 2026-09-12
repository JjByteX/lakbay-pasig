import { supabase } from "./supabase";
import type { DiscoverPlace } from "./discover-types";

/**
 * Phase 6.5-6.6 (step-5-phases.md): saved_places (migration 0007, owner-
 * only RLS via saved_places_own) is place-only, per data-model.md's End
 * User fields (Saved Places, Saved Routes — no Saved Businesses) and the
 * table's own place_id foreign key (references public.places(id), not a
 * type-plus-id pattern like route_stops/discovery_content use). No
 * saved_businesses table exists anywhere in the schema. This is the data
 * model as designed, not a gap this phase should silently patch by
 * inventing a new table, schema is on architecture-notes.md's never-
 * touch-without-approval list. Businesses are therefore not saveable in
 * v1; the save action only ever renders on a place's detail page.
 */

export async function isPlaceSaved(userId: string, placeId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("saved_places")
    .select("id")
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

/**
 * Signed-in tap inserts or deletes the row directly, per step-5-phases.md
 * 6.5, no confirmation modal needed for a reversible personal action.
 * Returns the new saved state so the caller can update its own UI without
 * a second round-trip read.
 */
export async function toggleSavedPlace(
  userId: string,
  placeId: string,
  currentlySaved: boolean
): Promise<boolean> {
  if (currentlySaved) {
    const { error } = await supabase
      .from("saved_places")
      .delete()
      .eq("user_id", userId)
      .eq("place_id", placeId);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("saved_places")
    .insert({ user_id: userId, place_id: placeId });
  if (error) throw error;
  return true;
}

/**
 * Step 8, Phase 1.2: saved-places list, Saved page's Saved Places section.
 * Two step fetch, same shape discover-query.ts's fetchPlaces already
 * establishes: plain select scoped by an owner-only RLS policy first
 * (saved_places_own, this user's rows only), then the matching places
 * rows for display fields, merged client side. saved_places has no
 * embedded place columns of its own, so a join back to places is required
 * either way; done as two queries rather than a Postgrest embed for the
 * same reason trail-query.ts's fetchCredentialNamesByRouteId gives, one
 * extra round trip is less code than an embed plus a null-shape check.
 *
 * Returns DiscoverPlace, not a new type: a saved place is still a place,
 * every field Discover already renders for one applies here unchanged.
 * verification_status is always "verified" for the same reason
 * discover-query.ts's fetchPlaces narrows it, places_select_public only
 * ever returns verified rows, so a saved place can't be anything else.
 */
export async function fetchSavedPlaces(userId: string): Promise<DiscoverPlace[]> {
  const { data: savedRows, error: savedError } = await supabase
    .from("saved_places")
    .select("place_id")
    .eq("user_id", userId);

  if (savedError) throw savedError;
  const placeIds = (savedRows ?? []).map((row) => row.place_id);
  if (placeIds.length === 0) return [];

  const { data: places, error: placesError } = await supabase
    .from("places")
    .select("id, name, category, description, latitude, longitude, verification_status")
    .in("id", placeIds);

  if (placesError) throw placesError;

  return (places ?? []).map((row) => ({
    kind: "place" as const,
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    verification_status: row.verification_status as "verified",
  }));
}
