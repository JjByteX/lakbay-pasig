import { supabase } from "./supabase";

/**
 * Step 8, Phase 1.4: new file, checked for an existing equivalent first
 * per constraints.md's Inventory Before Suggesting rule, nothing in
 * saved-places.ts, saved-routes.ts, or trail-completion.ts covers a
 * businesses read, and no vendor-status.ts or similar already exists.
 *
 * vendor-mode-spec.md's Account Model: "Vendor is not a separate account
 * type. It is a mode switch on a Registered User account... The Submitted
 * By field on the Local Business record tracks this ownership link."
 * There is no role column for this, per step-8-plan's own scope note,
 * whether an account is a vendor is derived by checking for a businesses
 * row where submitted_by = the signed-in user, not stored as a flag
 * anywhere on profiles.
 *
 * businesses_select_own (migration 0004, `using (auth.uid() =
 * submitted_by)`) already covers exactly this read, no RLS change
 * needed. verification_status is returned as the raw table value, not
 * narrowed to a literal union like DiscoverBusiness does, since an owner
 * reading their own row can see any of pending/verified/unverified,
 * unlike businesses_select_public which only ever returns verified rows.
 */
export interface VendorBusiness {
  id: string;
  name: string;
  verification_status: "pending" | "verified" | "unverified";
}

export async function getVendorBusiness(userId: string): Promise<VendorBusiness | null> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, verification_status")
    .eq("submitted_by", userId)
    .maybeSingle();

  if (error) throw error;
  return data as VendorBusiness | null;
}
