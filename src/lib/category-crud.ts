import { supabase } from "./supabase";

/**
 * Step 8 cleanup: place-categories.ts, trail-categories.ts, event-
 * categories.ts, business-categories.ts, and place-facilities.ts all
 * implement the exact same four functions -- fetchActiveCategories,
 * fetchAllCategories, createCategory, updateCategory -- against the
 * exact same "id, name, icon, active" shape, differing only in which
 * table they hit. admin-categories.tsx imports all five as namespaces
 * (`placeCategories.fetchAllCategories`, etc.) via its TAB_CONFIG, so
 * this factory is the one place that shape lives; each of the five
 * files becomes a thin call to it with its own table name and exported
 * type, and every exported function name/signature stays identical, so
 * admin-categories.tsx needs no changes.
 *
 * A single generic row type is used everywhere ("id, name, icon,
 * active"), since every one of the five row interfaces (PlaceCategory,
 * TrailCategory, EventCategory, BusinessCategory, PlaceFacility) is
 * that same four-field shape today -- each file still exports its own
 * named interface (callers keep importing PlaceCategory, TrailCategory,
 * etc.), this factory just doesn't need to know those names.
 */

export interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

export interface CategoryFormInput {
  name: string;
  icon: string;
  active: boolean;
}

export interface CategoryCrud<T extends CategoryRow> {
  fetchActiveCategories(): Promise<T[]>;
  fetchAllCategories(): Promise<T[]>;
  createCategory(input: CategoryFormInput): Promise<void>;
  updateCategory(id: string, input: CategoryFormInput): Promise<void>;
}

/**
 * Builds the four functions against a single table name. Table name is
 * a plain string, not a generic-constrained union, since it's only ever
 * used as a runtime argument to supabase.from() -- each call site below
 * already has its own compile-time-checked table name via the specific
 * PostgREST types Supabase generates, so re-deriving that constraint
 * here would duplicate what each caller's own file already gets for
 * free from the `supabase.from("exact_table_name")` call it makes.
 */
export function createCategoryCrud<T extends CategoryRow>(table: string): CategoryCrud<T> {
  return {
    async fetchActiveCategories(): Promise<T[]> {
      const { data, error } = await supabase
        .from(table)
        .select("id, name, icon, active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as T[];
    },

    async fetchAllCategories(): Promise<T[]> {
      const { data, error } = await supabase
        .from(table)
        .select("id, name, icon, active")
        .order("name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as T[];
    },

    async createCategory(input: CategoryFormInput): Promise<void> {
      const { error } = await supabase.from(table).insert(input);
      if (error) throw error;
    },

    async updateCategory(id: string, input: CategoryFormInput): Promise<void> {
      const { error } = await supabase.from(table).update(input).eq("id", id);
      if (error) throw error;
    },
  };
}
