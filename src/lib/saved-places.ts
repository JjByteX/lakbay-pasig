import { supabase } from "./supabase";
import { readEmbeddedName, readEmbeddedIcon, readEmbeddedColor } from "./place-categories";
import { fetchCoverPhotoUrls } from "./home-query";
import type { DiscoverPlace } from "./discover-types";

/**
 * Phase 6.5-6.6 (step-5-phases.md): saved_places (migration 0007, owner-
 * only RLS via saved_places_own) is place-only, with a place_id foreign
 * key (references public.places(id), not a type-plus-id pattern like
 * route_stops/discovery_content use). Businesses have their own table,
 * saved_businesses (migration 0047, saved-businesses.ts), rather than a
 * type column here, the same reason 0007 gives for keeping saved_places
 * and saved_routes apart. Until 0047 businesses were not saveable in v1,
 * which was the data model as designed then, not a gap to patch silently:
 * schema is on architecture-notes.md's never-touch-without-approval list.
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
 * Every place id this user has saved, in one request. The Discover list draws
 * a heart on every card, and asking isPlaceSaved once per card would be one
 * round trip per result; the list reads this set once instead and hands each
 * heart its answer. Same owner-only RLS as the rest of this file
 * (saved_places_own), ids only, no places join.
 */
export async function fetchSavedPlaceIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("saved_places")
    .select("place_id")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.place_id));
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
    .select(
      "id, name, description, latitude, longitude, verification_status, place_categories(name, icon, color), facility_ids"
    )
    .in("id", placeIds);

  if (placesError) throw placesError;

  // Phase 1.4 (place-category-directory-phases.md): category is now a
  // joined place_categories.name (migration 0022), flattened here so
  // DiscoverPlace's own category field stays string, matching discover-
  // query.ts's fetchPlaces fix for the same schema change.
  //
  // Phase 2 (feature-request-phases.md, Discover Facility Filters):
  // DiscoverPlace gained a required facility_ids field so Discover's new
  // filter has something to match against. A saved place is still a
  // DiscoverPlace (this function's own doc comment above), so this select
  // widened the same way discover-query.ts's fetchPlaces did, keeping both
  // constructors of a DiscoverPlace in sync rather than leaving this one
  // to silently miss the field, caught by grepping every DiscoverPlace
  // object-literal construction site before considering Phase 2 done, per
  // constraints.md's File Traversal rule.
  //
  // Map-marker-icons phase: same discipline, same grep, for the new
  // required categoryIcon field -- place_categories(name, icon) now widens
  // this select too, kept in sync with discover-query.ts's fetchPlaces.
  //
  // Map hover/full-details photos phase: same discipline again, for the
  // new required coverPhotoUrl field -- same fetchCoverPhotoUrls helper
  // discover-query.ts's fetchPlaces uses, run after the places themselves
  // resolve (needs their ids) for the same reason that file's own copy
  // does, rather than re-querying place_photos separately here.
  const coverPhotos = await fetchCoverPhotoUrls(
    "place_photos",
    "place_id",
    (places ?? []).map((row) => row.id)
  );

  return (places ?? []).map((row) => ({
    kind: "place" as const,
    id: row.id,
    name: row.name,
    category: readEmbeddedName(row.place_categories) ?? "",
    categoryIcon: readEmbeddedIcon(row.place_categories),
    // Category Colors: same embed, third field read off it.
    categoryColor: readEmbeddedColor(row.place_categories),
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    verification_status: row.verification_status as "verified",
    facility_ids: row.facility_ids ?? [],
    coverPhotoUrl: coverPhotos.get(row.id) ?? null,
  }));
}
