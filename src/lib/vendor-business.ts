import { supabase } from "./supabase";
import type { VendorBusinessDetail, VendorBusinessPayload } from "./vendor-types";

/**
 * Step 9, Phase 1.2: new file, checked first per constraints.md's Inventory
 * Before Suggesting rule. Confirmed in Phase 0.3 that no create/update
 * write path exists anywhere in src/, vendor-status.ts is read only.
 *
 * businesses_insert_own and businesses_update_own (migration 0004) both
 * check `auth.uid() = submitted_by`, re-confirmed directly in Phase 0.1.
 * Both functions here send an explicit allow-list only, never the staff-
 * only fields (verification_status, featured_status, reviewed_by,
 * review_notes, views_count, saves_count), per architecture-notes.md's
 * Known Fragile Areas note that RLS guards the row, not the column.
 */

export async function fetchOwnBusiness(userId: string): Promise<VendorBusinessDetail | null> {
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, business_type, category_id, description, address, contact, opening_hours, business_story, unique_specialty, accessibility_info, social_media_links, language, verification_status, review_notes, featured_status, registered_or_informal, views_count, saves_count"
    )
    .eq("submitted_by", userId)
    .maybeSingle();

  if (error) throw error;
  return data as VendorBusinessDetail | null;
}

/**
 * Tier 1 self-listing, per vendor-mode-spec.md's Basic Listing section:
 * goes live instantly, verification_status defaults to 'pending' at the
 * database level (migration 0004's own column default), never sent from
 * here. Does not check for an existing listing first, that block is step
 * 10's "one listing per account by default" rule, out of this step's scope
 * per build-order.md's own sequencing.
 */
export async function createBusiness(
  userId: string,
  payload: VendorBusinessPayload
): Promise<string> {
  const { data, error } = await supabase
    .from("businesses")
    .insert({ ...payload, submitted_by: userId })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function updateBusiness(
  businessId: string,
  payload: VendorBusinessPayload
): Promise<void> {
  const { error } = await supabase.from("businesses").update(payload).eq("id", businessId);
  if (error) throw error;
}
