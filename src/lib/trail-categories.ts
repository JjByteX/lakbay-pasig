import { createCategoryCrud } from "./category-crud";

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

export type { CategoryFormInput } from "./category-crud";

/**
 * Step 8 cleanup: fetchActiveCategories/fetchAllCategories/createCategory/
 * updateCategory below are category-crud.ts's createCategoryCrud factory
 * bound to trail_categories, not five hand-written functions -- see
 * place-categories.ts's own header comment for the full duplication this
 * removes. Exported function names/signatures are unchanged, so admin-
 * categories.tsx's namespace imports (`trailCategories.fetchAllCategories`,
 * etc.) need no changes.
 *
 * Ordered alphabetically by name, not sort_order -- same reasoning as
 * place-categories.ts's own fetchActiveCategories: manual reordering was
 * dropped from the admin Categories page per direct instruction, and every
 * consumer of this list follows the same alphabetical order that page now
 * shows. sort_order is no longer a meaningful sequence -- the column
 * stays on the table (migration 0023), the app layer just no longer
 * maintains it as an ordered append point.
 */
const crud = createCategoryCrud<TrailCategory>("trail_categories");

export const fetchActiveCategories = crud.fetchActiveCategories;
export const fetchAllCategories = crud.fetchAllCategories;
export const createCategory = crud.createCategory;
export const updateCategory = crud.updateCategory;
