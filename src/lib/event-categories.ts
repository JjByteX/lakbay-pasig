import { supabase } from "./supabase";

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
  sort_order: number;
}

/**
 * Public read, active rows only, ordered for display. event_categories_
 * select_public (0024) allows this with no session, matching events_
 * select_public's own no-session shape for a published event.
 *
 * Ordered alphabetically by name, not sort_order -- same reasoning as
 * place-categories.ts's own fetchActiveCategories: manual reordering was
 * dropped from the admin Categories page per direct instruction, and every
 * consumer of this list follows the same alphabetical order that page now
 * shows.
 */
export async function fetchActiveCategories(): Promise<EventCategory[]> {
  const { data, error } = await supabase
    .from("event_categories")
    .select("id, name, icon, active")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as EventCategory[];
}

/**
 * Staff read, every row regardless of active status. Used by the admin
 * Categories page's Announcements tab. event_categories_select_staff
 * (0024) gates this to publish_events/admin. Alphabetical, same
 * reasoning as fetchActiveCategories above.
 */
export async function fetchAllCategories(): Promise<EventCategory[]> {
  const { data, error } = await supabase
    .from("event_categories")
    .select("id, name, icon, active")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as EventCategory[];
}

export interface CategoryFormInput {
  name: string;
  icon: string;
  active: boolean;
}

/**
 * sort_order is no longer a meaningful sequence (see fetchActiveCategories'
 * own comment above) -- the column stays on the table (migration 0024),
 * the app layer just no longer maintains it as an ordered append point.
 */
export async function createCategory(input: CategoryFormInput): Promise<void> {
  const { error } = await supabase.from("event_categories").insert(input);

  if (error) throw error;
}

export async function updateCategory(id: string, input: CategoryFormInput): Promise<void> {
  const { error } = await supabase
    .from("event_categories")
    .update(input)
    .eq("id", id);

  if (error) throw error;
}
