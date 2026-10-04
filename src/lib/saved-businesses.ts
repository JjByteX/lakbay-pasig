import { supabase } from "./supabase";
import { readEmbeddedName } from "./place-categories";
import { fetchCoverPhotoUrls } from "./home-query";

/**
 * saved_businesses (migration 0047, own rows only via saved_businesses_own),
 * the business twin of saved-places.ts. Two small tables rather than one
 * polymorphic one, the reason migration 0007 gives for saved_places and
 * saved_routes. Business saves feed the "For you" row (recommend_items leaves
 * a saved business out and uses it as a taste source) and nothing else: no
 * count of saves is ever shown or read (recommendation-plan.md, Principles).
 */

// A saved business as the Saved page's card needs it. Deliberately not
// DiscoverBusiness: that type already has five constructors (architecture-
// notes.md) and this card only shows a cover photo, a name, a category and a
// badge. coverPhotoUrl is the same lowest-sort_order business_photos url
// DiscoverPlace.coverPhotoUrl carries for a saved place, null when none.
export interface SavedBusiness {
  id: string;
  name: string;
  category: string;
  verification_status: "verified" | "pending";
  coverPhotoUrl: string | null;
}

export async function isBusinessSaved(userId: string, businessId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("saved_businesses")
    .select("id")
    .eq("user_id", userId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

// Same contract as toggleSavedPlace: inserts or deletes the row directly and
// returns the new saved state.
export async function toggleSavedBusiness(
  userId: string,
  businessId: string,
  currentlySaved: boolean
): Promise<boolean> {
  if (currentlySaved) {
    const { error } = await supabase
      .from("saved_businesses")
      .delete()
      .eq("user_id", userId)
      .eq("business_id", businessId);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("saved_businesses")
    .insert({ user_id: userId, business_id: businessId });
  if (error) throw error;
  return true;
}

/**
 * The Saved page's Businesses list. Two steps like fetchSavedPlaces: the
 * caller's own saved ids first, then the businesses for display. The status
 * filter is repeated here (decision-log.md entries #29 and #31): owners and
 * staff can read wider rows, and a business CATO later rejected must not
 * linger in someone's list. The category is the table name, or the old free
 * text for a business saved before migration 0027 gave it a category_id.
 */
export async function fetchSavedBusinesses(userId: string): Promise<SavedBusiness[]> {
  const { data: savedRows, error: savedError } = await supabase
    .from("saved_businesses")
    .select("business_id")
    .eq("user_id", userId);

  if (savedError) throw savedError;
  const ids = (savedRows ?? []).map((row) => row.business_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, verification_status, category_text_legacy, business_categories(name)")
    .in("id", ids)
    .in("verification_status", ["verified", "pending"]);

  if (error) throw error;

  // Cover photos, same shared helper fetchSavedPlaces uses (business_photos
  // here). Run after the rows resolve since it needs the surviving ids.
  const coverPhotos = await fetchCoverPhotoUrls(
    "business_photos",
    "business_id",
    (data ?? []).map((row) => row.id)
  );

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: readEmbeddedName(row.business_categories) ?? row.category_text_legacy ?? "",
    verification_status: row.verification_status as "verified" | "pending",
    coverPhotoUrl: coverPhotos.get(row.id) ?? null,
  }));
}
