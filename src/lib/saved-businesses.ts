import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { fetchDiscoverResults } from "./discover-query";
import { readSaved, replaceSaved } from "./offline/mine";
import { readIsSaved, readSavedIds, settle, writeSaved } from "./offline/queue";
import { failReason } from "./offline/rules";
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

// Phase 8 (offline-phases.md): reads and writes go through offline/queue.ts,
// same as saved-places.ts. A copy on the device answers offline, and a save or
// unsave made offline is queued.
export async function isBusinessSaved(userId: string, businessId: string): Promise<boolean> {
  return readIsSaved(userId, "business", businessId, async () => {
    const { data, error } = await supabase
      .from("saved_businesses")
      .select("id")
      .eq("user_id", userId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) throw error;
    return data !== null;
  });
}

// Every business id this user has saved, in one request: the business twin of
// saved-places.ts's fetchSavedPlaceIds, for the Discover list's hearts.
export async function fetchSavedBusinessIds(userId: string): Promise<Set<string>> {
  return readSavedIds(userId, "business", async () => {
    const { data, error } = await supabase
      .from("saved_businesses")
      .select("business_id")
      .eq("user_id", userId);

    if (error) throw error;
    return new Set((data ?? []).map((row) => row.business_id));
  });
}

// Same contract as toggleSavedPlace: inserts or deletes the row directly and
// returns the new saved state.
export async function toggleSavedBusiness(
  userId: string,
  businessId: string,
  currentlySaved: boolean
): Promise<boolean> {
  return writeSaved("business", userId, businessId, !currentlySaved, async () => {
    if (currentlySaved) {
      const { error } = await supabase
        .from("saved_businesses")
        .delete()
        .eq("user_id", userId)
        .eq("business_id", businessId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from("saved_businesses")
      .insert({ user_id: userId, business_id: businessId });
    if (error) throw error;
  });
}

// Offline: the saved ids kept on this device, joined in memory with the
// businesses the Pasig download holds. Without a copy of the ids, the original
// error stands.
async function savedBusinessesOffline(userId: string, cause: PostgrestError): Promise<SavedBusiness[]> {
  const ids = await readSaved(userId, "business");
  if (!ids) throw cause;
  if (ids.size === 0) return [];
  const results = await fetchDiscoverResults();
  const saved: SavedBusiness[] = [];
  for (const row of results) {
    if (row.kind !== "business" || !ids.has(row.id)) continue;
    saved.push({
      id: row.id,
      name: row.name,
      category: row.category ?? "",
      verification_status: row.verification_status,
      coverPhotoUrl: row.coverPhotoUrl,
    });
  }
  return saved;
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
  await settle(userId);
  const { data: savedRows, error: savedError } = await supabase
    .from("saved_businesses")
    .select("business_id")
    .eq("user_id", userId);

  if (savedError) {
    if (failReason(savedError) === "network") return savedBusinessesOffline(userId, savedError);
    throw savedError;
  }
  const ids = (savedRows ?? []).map((row) => row.business_id);
  await replaceSaved(userId, "business", ids);
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
