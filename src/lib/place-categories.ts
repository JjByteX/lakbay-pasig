import { createCategoryCrud } from "./category-crud";

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

/**
 * Map-marker-icons phase: sibling to readEmbeddedName above, same
 * Postgrest to-one embed-shape uncertainty, reading `icon` instead of
 * `name` off place_categories/business_categories. Kept separate rather
 * than widening readEmbeddedName's own return shape, since every other
 * call site of readEmbeddedName (trail_categories, event_categories, the
 * place/business category joins that only ever want the label) has no use
 * for icon and would need an unused field threaded through otherwise.
 */
export function readEmbeddedIcon(
  embed: { icon: string } | { icon: string }[] | null | undefined
): string | null {
  if (embed === null || embed === undefined) return null;
  if (Array.isArray(embed)) return embed[0]?.icon ?? null;
  return embed.icon;
}

export interface PlaceCategory {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

export type { CategoryFormInput } from "./category-crud";

/**
 * Step 8 cleanup: fetchActiveCategories/fetchAllCategories/createCategory/
 * updateCategory below are category-crud.ts's createCategoryCrud factory
 * bound to place_categories, not five hand-written functions -- this file,
 * trail-categories.ts, event-categories.ts, business-categories.ts, and
 * place-facilities.ts all had byte-identical implementations of these four
 * functions differing only by table name, per constraints.md's Inventory
 * Before Suggesting rule. Exported function names/signatures are
 * unchanged, so admin-categories.tsx's namespace imports
 * (`placeCategories.fetchAllCategories`, etc.) need no changes.
 *
 * Ordered alphabetically by name, not sort_order -- per direct
 * instruction, manual reordering was dropped from the admin Categories
 * page (see admin-categories.tsx's own header comment) in favor of a
 * searchable, sortable table matching every other admin list, and that
 * change was extended here too so every consumer of this list (Discover's
 * chips, the place form's picker) reads the same alphabetical order the
 * admin table now shows, rather than a frozen legacy sort_order value
 * nothing can edit anymore. sort_order stays on the table (not null,
 * default 0, migration 0022) since dropping it is a schema change outside
 * this instruction's scope, but the app layer no longer maintains it as
 * an ordered append point -- a new row is simply inserted with whatever
 * default the column already provides.
 */
const crud = createCategoryCrud<PlaceCategory>("place_categories");

export const fetchActiveCategories = crud.fetchActiveCategories;
export const fetchAllCategories = crud.fetchAllCategories;
export const createCategory = crud.createCategory;
export const updateCategory = crud.updateCategory;
