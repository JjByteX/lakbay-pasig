import { supabase } from "./supabase";
import { readEmbeddedName } from "./place-categories";

// Global search, per the resolved spec: a search bar visible on every tab
// except Profile (navigation-and-access-control.md's tab list minus
// Profile, confirmed directly), reaching into five sources that are
// name-searchable and public per data-model.md/architecture-notes.md's
// schema table -- Places, Businesses, Trails (routes), Events, and Items
// (business_items_select_public 0016, business_item_photos_select_public
// 0040). Saved and Profile carry no independent content of their own to
// search, only personal records of content that already lives in one of
// these.
//
// Each group reuses the exact RLS-scoped select an existing query file
// already runs (discover-query.ts's fetchPlaces/fetchBusinesses,
// trail-query.ts's fetchPublishedTrails, home-query.ts's
// fetchAnnouncements), narrowed by migration 0042's typo-tolerant search_*
// functions (one per table, SECURITY INVOKER, so the same RLS applies) and
// capped at a small row count, since this is a live-typing dropdown, not a
// full results page -- no separate results screen exists per the resolved
// spec ("router to the right tab" was the alternative considered and
// rejected in favor of one merged query, see the prior conversation this
// session continues from).
const RESULT_LIMIT = 5;

// .rpc().select() types its result as one row or an array of rows, so each
// search below narrows with Array.isArray before mapping. A set-returning
// function always sends an array at runtime; this only settles the type.

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

export interface SearchItemHit {
  kind: "item";
  id: string;
  name: string;
  price: number | null;
  photoUrl: string | null;
  businessId: string;
  businessName: string;
  verification_status: "verified" | "pending";
}

// Fetch one more than the panel shows: the extra row only proves there is
// more, which is what the View all row keys off.
export const ITEM_FETCH_LIMIT = 4;
export const ITEM_SHOW_LIMIT = 3;

export interface GlobalSearchResults {
  places: SearchPlaceHit[];
  businesses: SearchBusinessHit[];
  trails: SearchTrailHit[];
  events: SearchEventHit[];
  items: SearchItemHit[];
}

export const EMPTY_SEARCH_RESULTS: GlobalSearchResults = {
  places: [],
  businesses: [],
  trails: [],
  events: [],
  items: [],
};

export function hasAnyResults(results: GlobalSearchResults): boolean {
  return (
    results.places.length > 0 ||
    results.businesses.length > 0 ||
    results.trails.length > 0 ||
    results.events.length > 0 ||
    results.items.length > 0
  );
}

async function searchPlaces(q: string): Promise<SearchPlaceHit[]> {
  // places_select_public (0003): verified only, same policy discover-
  // query.ts's fetchPlaces reads through, unchanged here. Phase 1.4
  // (place-category-directory-phases.md): category is now a joined
  // place_categories.name (migration 0022), flattened below.
  const { data, error } = await supabase
    .rpc("search_places", { q, lim: RESULT_LIMIT })
    .select("id, name, place_categories(name)");

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => ({
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
    .rpc("search_businesses", { q, lim: RESULT_LIMIT })
    .select("id, name, business_categories(name), verification_status");

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => ({
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
    .rpc("search_trails", { q, lim: RESULT_LIMIT })
    .select("id, name, trail_categories(name)");

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => ({
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
  // signed-in staff account browsing the public surface). search_events
  // (0042) takes only_published, default true, and applies it inside the
  // function, so the same explicit filter still holds and the row cap only
  // counts published rows. Category Directory Phase 1.10: category is now
  // a joined event_categories.name (migration 0024), flattened below.
  const { data, error } = await supabase
    .rpc("search_events", { q, lim: RESULT_LIMIT })
    .select("id, title, event_categories(name)");

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => ({
    kind: "event" as const,
    id: row.id,
    title: row.title,
    category: readEmbeddedName(row.event_categories),
  }));
}

async function searchItems(q: string): Promise<SearchItemHit[]> {
  // business_items_select_own and business_items_write_staff (0004) let an
  // owner or staff read an unverified store's items, so the status filter is
  // repeated here, same as searchEvents repeats published = true.
  // search_items (0042) applies the same two statuses inside the function so
  // the row cap counts only shown rows, and returns rows already ordered:
  // best match first, then name, then price low to high, unpriced last.
  const { data, error } = await supabase
    .rpc("search_items", { q, lim: ITEM_FETCH_LIMIT })
    .in("businesses.verification_status", ["verified", "pending"])
    .select(
      "id, name, price, business_id, businesses!inner(name, verification_status), business_item_photos(photo_url)"
    )
    .order("sort_order", { referencedTable: "business_item_photos" })
    .limit(1, { referencedTable: "business_item_photos" });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => {
    // The !inner embed can come back as an object or a one item array.
    const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
    return {
      kind: "item" as const,
      id: row.id,
      name: row.name,
      price: row.price,
      photoUrl: row.business_item_photos?.[0]?.photo_url ?? null,
      businessId: row.business_id,
      businessName: business.name,
      verification_status: business.verification_status as "verified" | "pending",
    };
  });
}

/**
 * One call, five independent queries in parallel, grouped result. A
 * failure in one group does not blank the others -- each group is caught
 * independently and simply comes back empty, since a partial result set
 * (e.g. trails failed, places/businesses/events/items still show) is more useful
 * to someone mid-search than a single error wiping every group. Empty
 * query returns EMPTY_SEARCH_RESULTS without a network call, same
 * no-op-on-empty-input shape filterDiscoverResults already uses.
 */
export async function searchEverything(query: string): Promise<GlobalSearchResults> {
  const q = query.trim();
  if (!q) return EMPTY_SEARCH_RESULTS;

  const [places, businesses, trails, events, items] = await Promise.all([
    searchPlaces(q).catch(() => []),
    searchBusinesses(q).catch(() => []),
    searchTrails(q).catch(() => []),
    searchEvents(q).catch(() => []),
    searchItems(q).catch(() => []),
  ]);

  return { places, businesses, trails, events, items };
}
