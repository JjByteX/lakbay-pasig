import { createCategoryCrud } from "./category-crud";

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

export type { CategoryFormInput } from "./category-crud";

/**
 * Step 8 cleanup: fetchActiveCategories/fetchAllCategories/createCategory/
 * updateCategory below are category-crud.ts's createCategoryCrud factory
 * bound to business_categories, not five hand-written functions -- see
 * place-categories.ts's own header comment for the full duplication this
 * removes. Exported function names/signatures are unchanged, so admin-
 * categories.tsx's namespace imports
 * (`businessCategories.fetchAllCategories`, etc.) need no changes.
 *
 * Ordered alphabetically by name, not sort_order -- same reasoning as
 * place-categories.ts's own fetchActiveCategories: this feature's admin
 * Categories page shows every tab in alphabetical order, not a manually
 * maintained sequence, and every consumer of this list follows that same
 * order. sort_order stays on the table (migration 0027) but is not
 * maintained by the app layer as an ordered append point, same as the
 * other category tables.
 */
const crud = createCategoryCrud<BusinessCategory>("business_categories");

export const fetchActiveCategories = crud.fetchActiveCategories;
export const fetchAllCategories = crud.fetchAllCategories;
export const createCategory = crud.createCategory;
export const updateCategory = crud.updateCategory;
