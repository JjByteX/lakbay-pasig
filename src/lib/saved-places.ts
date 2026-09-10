import { supabase } from "./supabase";

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
