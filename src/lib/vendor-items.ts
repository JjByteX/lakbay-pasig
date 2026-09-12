import { supabase } from "./supabase";
import type { VendorItem } from "./vendor-types";

/**
 * Step 9, Phase 1.3: business_items CRUD for the owning vendor.
 * business_items_write_own (migration 0004) checks the parent business's
 * submitted_by, re-confirmed in Phase 0.1, so these calls need no
 * businessId cross-check beyond what the RLS policy already enforces on
 * write; a vendor cannot write an item onto a business they don't own,
 * the insert/update/delete would simply fail under RLS.
 *
 * Price stays optional throughout, per vendor-mode-spec.md's Price Is
 * Optional, Not Required section: no function here requires a price, and
 * business_items.price has no not-null constraint at the DB layer either.
 */

export async function fetchItems(businessId: string): Promise<VendorItem[]> {
  const { data, error } = await supabase
    .from("business_items")
    .select("id, name, price")
    .eq("business_id", businessId);

  if (error) throw error;
  return (data ?? []) as VendorItem[];
}

export async function createItem(
  businessId: string,
  name: string,
  price: number | null
): Promise<VendorItem> {
  const { data, error } = await supabase
    .from("business_items")
    .insert({ business_id: businessId, name, price })
    .select("id, name, price")
    .single();

  if (error) throw error;
  return data as VendorItem;
}

export async function updateItem(id: string, name: string, price: number | null): Promise<void> {
  const { error } = await supabase.from("business_items").update({ name, price }).eq("id", id);
  if (error) throw error;
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from("business_items").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Step 9, Phase 1.5: pure function, no Supabase call, per vendor-mode-
 * spec.md's dashboard requirement, "a visible count, like items missing a
 * price, so the gap stays visible over time, not just a one time
 * dismissible warning." Kept in this file rather than vendor-dashboard.ts
 * since it operates on the same VendorItem list fetchItems already
 * returns, not a second query.
 */
export function missingPriceCount(items: VendorItem[]): number {
  return items.filter((item) => item.price === null).length;
}
