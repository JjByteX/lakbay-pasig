import { createCategoryCrud } from "./category-crud";

/**
 * Category Directory, Phase 1.8. Backs the admin Categories page's
 * Announcements tab and the event form's category field, per the plan
 * doc. Same shape as place-categories.ts and trail-categories.ts, applied
 * to event_categories (migration 0024).
 */

export interface EventCategory {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

export type { CategoryFormInput } from "./category-crud";

/**
 * Step 8 cleanup: fetchActiveCategories/fetchAllCategories/createCategory/
 * updateCategory below are category-crud.ts's createCategoryCrud factory
 * bound to event_categories, not five hand-written functions -- see
 * place-categories.ts's own header comment for the full duplication this
 * removes. Exported function names/signatures are unchanged, so admin-
 * categories.tsx's namespace imports (`eventCategories.fetchAllCategories`,
 * etc.) need no changes.
 *
 * The previous EventCategory interface carried its own sort_order field,
 * but no query in this file (before or after this change) ever selected
 * it, and no caller ever read it -- admin-categories.tsx's own TAB_CONFIG
 * only calls fetchAllCategories/createCategory/updateCategory through
 * this file, never .sort_order directly. Dropped here rather than kept as
 * dead shape now that EventCategory matches the same four-field
 * CategoryRow the factory returns for every other category table.
 *
 * Ordered alphabetically by name, not sort_order -- same reasoning as
 * place-categories.ts's own fetchActiveCategories: manual reordering was
 * dropped from the admin Categories page per direct instruction, and every
 * consumer of this list follows the same alphabetical order that page now
 * shows.
 */
const crud = createCategoryCrud<EventCategory>("event_categories");

export const fetchActiveCategories = crud.fetchActiveCategories;
export const fetchAllCategories = crud.fetchAllCategories;
export const createCategory = crud.createCategory;
export const updateCategory = crud.updateCategory;
