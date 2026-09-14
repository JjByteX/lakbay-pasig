import { supabase } from "./supabase";

/**
 * Category Directory Expansion, Phase 1.5. Backs the admin Categories
 * page's Business Category tab and the business form's category field
 * (business-fields.tsx, Phase 4's scope), per the expansion plan doc. Same
 * four-function shape as place-categories.ts/trail-categories.ts/event-
 * categories.ts, applied to business_categories (migration 0027) instead
 * of place_categories -- function names match exactly, since admin-
 * categories.tsx's TAB_CONFIG calls every tab's lib through these same
 * four names and expects the same return shape.
 *
 * Unlike place_facilities, a business has a single category_id (a plain
 * foreign key on businesses, not an array), the same to-one shape place/
 * trail/event category already use -- readEmbeddedName (place-
 * categories.ts) applies here as-is, this file doesn't need its own
 * plural variant the way place-facilities.ts did.
 */

export interface BusinessCategory {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

/**
 * Public read, active rows only, ordered for display. Used anywhere a
 * Guest or the business form (admin and vendor, both via business-
 * fields.tsx) needs the current pick list. business_categories_select_
 * public (0027) covers this with no session required, same shape place_
 * categories_select_public already has.
 *
 * Ordered alphabetically by name, not sort_order -- same reasoning as
 * place-categories.ts's own fetchActiveCategories: this feature's admin
 * Categories page shows every tab in alphabetical order, not a manually
 * maintained sequence, and every consumer of this list follows that same
 * order.
 */
export async function fetchActiveCategories(): Promise<BusinessCategory[]> {
  const { data, error } = await supabase
    .from("business_categories")
    .select("id, name, icon, active")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BusinessCategory[];
}

/**
 * Staff read, every row regardless of active status. Used by the admin
 * Categories page's Business Category tab, where a retired category still
 * needs to show (and be re-activated) rather than disappearing once
 * turned off. business_categories_select_staff (0027) gates this to
 * review_businesses/admin, not manage_places -- a business category is
 * Business content, same distinction migration 0027's own RLS draws.
 * Alphabetical, same reasoning as fetchActiveCategories above.
 */
export async function fetchAllCategories(): Promise<BusinessCategory[]> {
  const { data, error } = await supabase
    .from("business_categories")
    .select("id, name, icon, active")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BusinessCategory[];
}

export interface CategoryFormInput {
  name: string;
  icon: string;
  active: boolean;
}

/**
 * sort_order stays on the table (migration 0027) but is not maintained by
 * the app layer as an ordered append point, same as the other three
 * category tables. A new row is inserted with whatever default the column
 * already provides.
 */
export async function createCategory(input: CategoryFormInput): Promise<void> {
  const { error } = await supabase.from("business_categories").insert(input);

  if (error) throw error;
}

export async function updateCategory(id: string, input: CategoryFormInput): Promise<void> {
  const { error } = await supabase
    .from("business_categories")
    .update(input)
    .eq("id", id);

  if (error) throw error;
}
