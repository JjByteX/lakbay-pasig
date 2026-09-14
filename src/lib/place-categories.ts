import { supabase } from "./supabase";

/**
 * Place Category Directory, Phase 1. Backs the admin Categories section,
 * the place form's category field, and the Discover category filter, per
 * the plan doc. Places only, migration 0022. businesses.category (0004)
 * stays free text with no table of its own, not this file's concern.
 */

/**
 * Phase 1.10 correction: event-detail.tsx's existing related_place_id
 * embed (`places(name)`) returns an array (`event.places[0]?.name`), even
 * though related_place_id is a plain single-value foreign key, the same
 * shape category_id has. Postgrest's embed shape for a belongs-to
 * relationship isn't guaranteed to come back as a bare object just
 * because the column is singular, confirmed by that file's own working
 * code, not assumed. Every embed added across this feature (place_
 * categories, trail_categories, event_categories) uses this helper
 * instead of a bare `(row.foo_categories as {name} | null)?.name` cast,
 * so a name resolves correctly regardless of which shape Postgrest
 * actually returns for that particular query.
 */
export function readEmbeddedName(
  embed: { name: string } | { name: string }[] | null | undefined
): string | null {
  if (embed === null || embed === undefined) return null;
  if (Array.isArray(embed)) return embed[0]?.name ?? null;
  return embed.name;
}

export interface PlaceCategory {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

/**
 * Public read, active rows only, ordered for display. Used anywhere a
 * Guest or a place-submission form needs the current pick list: the
 * place form's category Select, and the Discover filter's chip row.
 * place_categories_select_public (0022) covers this with no session
 * required, same shape places_select_public already has.
 *
 * Ordered alphabetically by name, not sort_order -- per direct
 * instruction, manual reordering was dropped from the admin Categories
 * page (see admin-categories.tsx's own header comment) in favor of a
 * searchable, sortable table matching every other admin list, and that
 * change was extended here too so every consumer of this list (Discover's
 * chips, the place form's picker) reads the same alphabetical order the
 * admin table now shows, rather than a frozen legacy sort_order value
 * nothing can edit anymore.
 */
export async function fetchActiveCategories(): Promise<PlaceCategory[]> {
  const { data, error } = await supabase
    .from("place_categories")
    .select("id, name, icon, active")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PlaceCategory[];
}

/**
 * Staff read, every row regardless of active status. Used by the admin
 * Categories list, where a retired category still needs to show (and be
 * re-activated) rather than disappearing once turned off.
 * place_categories_select_staff (0022) gates this to manage_places/admin.
 * Alphabetical, same reasoning as fetchActiveCategories above.
 */
export async function fetchAllCategories(): Promise<PlaceCategory[]> {
  const { data, error } = await supabase
    .from("place_categories")
    .select("id, name, icon, active")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PlaceCategory[];
}

export interface CategoryFormInput {
  name: string;
  icon: string;
  active: boolean;
}

/**
 * sort_order is no longer a meaningful sequence (see fetchActiveCategories'
 * own comment above) -- the column stays on the table (not null, default 0,
 * migration 0022) since dropping it is a schema change outside this
 * instruction's scope, but the app layer no longer maintains it as an
 * ordered append point. A new row is simply inserted with whatever default
 * the column already provides.
 */
export async function createCategory(input: CategoryFormInput): Promise<void> {
  const { error } = await supabase.from("place_categories").insert(input);

  if (error) throw error;
}

export async function updateCategory(id: string, input: CategoryFormInput): Promise<void> {
  const { error } = await supabase
    .from("place_categories")
    .update(input)
    .eq("id", id);

  if (error) throw error;
}
