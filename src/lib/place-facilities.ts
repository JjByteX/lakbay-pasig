import { createCategoryCrud } from "./category-crud";

/**
 * Category Directory Expansion, Phase 1.1. Backs the admin Categories
 * page's Facilities tab and the place form's facility picker, per the
 * expansion plan doc. Same four-function shape as place-categories.ts/
 * trail-categories.ts/event-categories.ts, applied to place_facilities
 * (migration 0026) instead of place_categories -- function names match
 * exactly, even though this table isn't named "category," since
 * admin-categories.tsx's TAB_CONFIG calls every tab's lib through these
 * same four names and expects the same return shape.
 *
 * A place can hold several facilities at once (places.facility_ids is a
 * uuid[], not a single foreign key), unlike every other table this
 * feature manages. That difference lives in places.ts's own read/write
 * code, not here -- this file only manages the facility directory itself,
 * same single-row CRUD shape as the other four lib files.
 */

export interface PlaceFacility {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

export type { CategoryFormInput } from "./category-crud";

/**
 * Step 8 cleanup: fetchActiveCategories/fetchAllCategories/createCategory/
 * updateCategory below are category-crud.ts's createCategoryCrud factory
 * bound to place_facilities, not five hand-written functions -- see
 * place-categories.ts's own header comment for the full duplication this
 * removes. Exported function names/signatures are unchanged, so admin-
 * categories.tsx's namespace imports (`placeFacilities.fetchAllCategories`,
 * etc.) need no changes.
 *
 * Ordered alphabetically by name, not sort_order -- same reasoning as
 * place-categories.ts's own fetchActiveCategories: this feature's admin
 * Categories page shows every tab in alphabetical order, not a manually
 * maintained sequence, and every consumer of this list follows that same
 * order. sort_order stays on the table (migration 0026) but is not
 * maintained by the app layer as an ordered append point, same as the
 * other category tables after the reorder rollback.
 */
const crud = createCategoryCrud<PlaceFacility>("place_facilities");

export const fetchActiveCategories = crud.fetchActiveCategories;
export const fetchAllCategories = crud.fetchAllCategories;
export const createCategory = crud.createCategory;
export const updateCategory = crud.updateCategory;

/**
 * Category Directory Expansion, Phase 1.3. places.facility_ids (migration
 * 0026) is a uuid[], the first to-many relationship this feature has had
 * to read back into a name list -- every other table (place/trail/event/
 * business category) is a single category_id, handled by place-
 * categories.ts's own readEmbeddedName. Postgrest's embed shape for a
 * to-many join isn't guaranteed to come back as any one particular array
 * shape either (same uncertainty the original feature's readEmbeddedName
 * comment already documents for to-one embeds), so this defensively
 * accepts a plain array of rows, a single row, or null/undefined, and
 * always returns a plain string array, never throwing on an unexpected
 * shape.
 */
export function readEmbeddedNames(
  embed: { name: string }[] | { name: string } | null | undefined
): string[] {
  if (embed === null || embed === undefined) return [];
  if (Array.isArray(embed)) return embed.map((row) => row.name);
  return [embed.name];
}
