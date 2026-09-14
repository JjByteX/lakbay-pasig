import { supabase } from "./supabase";

/**
 * Category Directory, Phase 1.5. Backs the admin Categories page's Trails
 * tab and the trail builder's category field, per the plan doc. Same
 * shape as place-categories.ts, applied to trail_categories (migration
 * 0023) instead of place_categories.
 */

export interface TrailCategory {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

/**
 * Public read, active rows only, ordered for display. trail_categories_
 * select_public (0023) allows this with no session, matching place_
 * categories' own public-read shape, in case a future public trail
 * browsing surface needs it; the trail builder itself is staff-only and
 * could use fetchAllCategories instead, but active-only matches what a
 * builder should be choosing from day to day.
 *
 * Ordered alphabetically by name, not sort_order -- same reasoning as
 * place-categories.ts's own fetchActiveCategories: manual reordering was
 * dropped from the admin Categories page per direct instruction, and every
 * consumer of this list follows the same alphabetical order that page now
 * shows.
 */
export async function fetchActiveCategories(): Promise<TrailCategory[]> {
  const { data, error } = await supabase
    .from("trail_categories")
    .select("id, name, icon, active")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TrailCategory[];
}

/**
 * Staff read, every row regardless of active status. Used by the admin
 * Categories page's Trails tab, where a retired category still needs to
 * show (and be re-activated) rather than disappearing once turned off.
 * trail_categories_select_staff (0023) gates this to build_trails/admin.
 * Alphabetical, same reasoning as fetchActiveCategories above.
 */
export async function fetchAllCategories(): Promise<TrailCategory[]> {
  const { data, error } = await supabase
    .from("trail_categories")
    .select("id, name, icon, active")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TrailCategory[];
}

export interface CategoryFormInput {
  name: string;
  icon: string;
  active: boolean;
}

/**
 * sort_order is no longer a meaningful sequence (see fetchActiveCategories'
 * own comment above) -- the column stays on the table (migration 0023),
 * the app layer just no longer maintains it as an ordered append point.
 */
export async function createCategory(input: CategoryFormInput): Promise<void> {
  const { error } = await supabase.from("trail_categories").insert(input);

  if (error) throw error;
}

export async function updateCategory(id: string, input: CategoryFormInput): Promise<void> {
  const { error } = await supabase
    .from("trail_categories")
    .update(input)
    .eq("id", id);

  if (error) throw error;
}
