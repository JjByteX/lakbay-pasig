import { supabase } from "./supabase";
import { readEmbeddedName } from "./place-categories";

// Global search, per the resolved spec: a search bar visible on every tab
// except Profile (navigation-and-access-control.md's tab list minus
// Profile, confirmed directly), reaching into exactly the four tables that
// are name-searchable and public per data-model.md/architecture-notes.md's
// schema table -- Places, Businesses, Trails (routes), Events. Saved and
// Profile carry no independent content of their own to search, only
// personal records of content that already lives in one of these four.
//
// Each group reuses the exact RLS-scoped select an existing query file
// already runs (discover-query.ts's fetchPlaces/fetchBusinesses,
// trail-query.ts's fetchPublishedTrails, home-query.ts's
// fetchAnnouncements), narrowed with `ilike` on the name/title column and
// capped at a small row count, since this is a live-typing dropdown, not a
// full results page -- no separate results screen exists per the resolved
// spec ("router to the right tab" was the alternative considered and
// rejected in favor of one merged query, see the prior conversation this
// session continues from).
const RESULT_LIMIT = 5;

export interface SearchPlaceHit {
  kind: "place";
  id: string;
  name: string;
  category: string;
}

export interface SearchBusinessHit {
  kind: "business";
  id: string;
  name: string;
  category: string | null;
  verification_status: "verified" | "pending";
}

export interface SearchTrailHit {
  kind: "trail";
  id: string;
  name: string;
  theme: string | null;
}

export interface SearchEventHit {
  kind: "event";
  id: string;
  title: string;
  category: string | null;
}

export interface GlobalSearchResults {
  places: SearchPlaceHit[];
  businesses: SearchBusinessHit[];
  trails: SearchTrailHit[];
  events: SearchEventHit[];
}

export const EMPTY_SEARCH_RESULTS: GlobalSearchResults = {
  places: [],
  businesses: [],
  trails: [],
  events: [],
};

export function hasAnyResults(results: GlobalSearchResults): boolean {
  return (
    results.places.length > 0 ||
    results.businesses.length > 0 ||
    results.trails.length > 0 ||
    results.events.length > 0
  );
}

async function searchPlaces(q: string): Promise<SearchPlaceHit[]> {
  // places_select_public (0003): verified only, same policy discover-
  // query.ts's fetchPlaces reads through, unchanged here. Phase 1.4
  // (place-category-directory-phases.md): category is now a joined
  // place_categories.name (migration 0022), flattened below.
  const { data, error } = await supabase
    .from("places")
    .select("id, name, place_categories(name)")
    .ilike("name", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "place" as const,
    id: row.id,
    name: row.name,
    category: readEmbeddedName(row.place_categories) ?? "",
  }));
}

async function searchBusinesses(q: string): Promise<SearchBusinessHit[]> {
  // businesses_select_public (0015): verified or pending, same policy
  // discover-query.ts's fetchBusinesses reads through, unchanged here.
  // Category Directory Expansion, Phase 1.7: category is now a joined
  // business_categories.name (migration 0027, category_id replaces the
  // old plain text column), flattened below, same pattern searchPlaces
  // above already uses for place_categories.
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, business_categories(name), verification_status")
    .ilike("name", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "business" as const,
    id: row.id,
    name: row.name,
    category: readEmbeddedName(row.business_categories),
    verification_status: row.verification_status as "verified" | "pending",
  }));
}

async function searchTrails(q: string): Promise<SearchTrailHit[]> {
  // routes_select_public (0005): published only, same policy trail-
  // query.ts's fetchPublishedTrails reads through, unchanged here.
  // Category Directory Phase 1.7: theme is now a joined trail_categories.
  // name (migration 0023), flattened below.
  const { data, error } = await supabase
    .from("routes")
    .select("id, name, trail_categories(name)")
    .ilike("name", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "trail" as const,
    id: row.id,
    name: row.name,
    theme: readEmbeddedName(row.trail_categories),
  }));
}

async function searchEvents(q: string): Promise<SearchEventHit[]> {
  // events_select_public (0006): published = true only, confirmed directly
  // from the migration before writing this, same policy home-query.ts's
  // fetchAnnouncements reads through (that query also adds an explicit
  // .eq("published", true) on top of RLS, since events_select_staff has no
  // published check of its own and could otherwise leak drafts to a
  // signed-in staff account browsing the public surface -- same reasoning
  // applies here, so the same explicit filter is repeated rather than
  // relying on RLS alone). Category Directory Phase 1.10: category is now
  // a joined event_categories.name (migration 0024), flattened below.
  const { data, error } = await supabase
    .from("events")
    .select("id, title, event_categories(name)")
    .eq("published", true)
    .ilike("title", `%${q}%`)
    .limit(RESULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    kind: "event" as const,
    id: row.id,
    title: row.title,
    category: readEmbeddedName(row.event_categories),
  }));
}

/**
 * One call, four independent queries in parallel, grouped result. A
 * failure in one group does not blank the others -- each group is caught
 * independently and simply comes back empty, since a partial result set
 * (e.g. trails failed, places/businesses/events still show) is more useful
 * to someone mid-search than a single error wiping every group. Empty
 * query returns EMPTY_SEARCH_RESULTS without a network call, same
 * no-op-on-empty-input shape filterDiscoverResults already uses.
 */
export async function searchEverything(query: string): Promise<GlobalSearchResults> {
  const q = query.trim();
  if (!q) return EMPTY_SEARCH_RESULTS;

  const [places, businesses, trails, events] = await Promise.all([
    searchPlaces(q).catch(() => []),
    searchBusinesses(q).catch(() => []),
    searchTrails(q).catch(() => []),
    searchEvents(q).catch(() => []),
  ]);

  return { places, businesses, trails, events };
}
