import { supabase } from "./supabase";
import {
  readEmbeddedName,
  readEmbeddedIcon,
  fetchActiveCategories as fetchActivePlaceCategories,
} from "./place-categories";
import { fetchActiveCategories as fetchActiveBusinessCategories } from "./business-categories";
import type {
  Announcement,
  CategoryRow,
  RecentlyVerifiedBusiness,
  RecentlyVerifiedItem,
  RecentlyVerifiedPlace,
} from "./home-types";

// Phase 2.2 (step-6-phases.md): "Feed of published announcements," per
// navigation-and-access-control.md's Home tab definition. The .eq() below
// is required, not just defensive: events_select_staff (migration 0006)
// has no published check at all, it grants full-table read to anyone with
// publish_events or the admin role. Nothing stops a CATO Staff account
// from browsing the public Home tab (PublicShell has no staff gate), and
// profiles.role/staff_role live on one row per account, no dual-role
// split, so that account's own SELECT on events would return drafts too
// under RLS alone. The explicit .eq("published", true) here is an
// additional AND-ed condition on top of whatever RLS lets through, so it
// holds regardless of which policy matched the caller. Newest first, per
// Home's "what's new" framing (navigation-and-access-control.md).
export async function fetchAnnouncements(): Promise<Announcement[]> {
  // Category Directory Phase 1.10: category is now a joined event_
  // categories.name (migration 0024, category_id replaces the old plain
  // text column), embedded here rather than a flat select, flattened
  // below so Announcement's own category field stays string | null,
  // unchanged for every existing caller.
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, date_time, location, related_place_id, event_categories(name)")
    .eq("published", true)
    .order("date_time", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => {
    const { event_categories, ...rest } = row as typeof row & {
      event_categories: { name: string } | { name: string }[] | null;
    };
    return { ...rest, category: readEmbeddedName(event_categories) };
  });
}

// home-photo-showcase-phases.md Phase 2.1: one helper, table name passed
// in, mirrors category-crud.ts's one-shape-two-tables approach rather than
// two near-identical functions for place_photos vs business_photos -- both
// tables share the exact same (parent_id, photo_url, sort_order) shape
// this needs (place_photos additionally has photo_type, unused here).
// Returns the lowest-sort_order photo url per parent id, as a Map for O(1)
// lookup by the caller; ids with no photo row at all simply have no entry,
// callers read that absence with `.get(id) ?? null`.
//
// Map hover/full-details photos phase: exported, no second copy written.
// discover-query.ts's own fetchPlaces/fetchBusinesses need the exact same
// "one cover photo per id, cheapest lookup shape" this already computes
// for Home's showcase, per constraints.md's Inventory Before Suggesting
// rule -- reused as-is rather than re-implemented against place_photos/
// business_photos a second time.
export async function fetchCoverPhotoUrls(
  table: "place_photos" | "business_photos",
  parentIdColumn: "place_id" | "business_id",
  ids: string[]
): Promise<Map<string, string>> {
  const covers = new Map<string, string>();
  if (ids.length === 0) return covers;

  const { data, error } = await supabase
    .from(table)
    .select(`${parentIdColumn}, photo_url, sort_order`)
    .in(parentIdColumn, ids)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  // Ordered ascending by sort_order, so the first row seen per parent id
  // is already its lowest-sort_order photo -- a plain "first write wins"
  // pass over the ordered rows is enough, no per-id min() needed.
  for (const row of (data ?? []) as { photo_url: string; sort_order: number; [key: string]: unknown }[]) {
    const parentId = row[parentIdColumn] as string;
    if (!covers.has(parentId)) covers.set(parentId, row.photo_url);
  }

  return covers;
}

// Phase 2.3: places (places_select_public, verified only) and businesses
// (businesses_select_public, verified or pending) fetched separately, same
// split discover-query.ts's fetchPlaces/fetchBusinesses already use, since
// RLS differs by table. Only verified businesses belong in "recently
// verified," so this filters on verification_status = 'verified' itself
// rather than reusing fetchBusinesses' full verified-or-pending set.
// Field list matches discover-query.ts's own summary shape (id, name,
// category, description, coordinates) plus verified_at (migration 0017),
// which Discover's query has no reason to select.
async function fetchRecentlyVerifiedPlaces(): Promise<RecentlyVerifiedPlace[]> {
  // Phase 1.4 (place-category-directory-phases.md): category is now a
  // joined place_categories.name (migration 0022), embedded and flattened
  // the same way discover-query.ts's fetchPlaces was fixed.
  //
  // home-photo-showcase-phases.md Phase 2.3/7.1: no row limit here --
  // fetchHomeShowcase (below) needs every verified, photo-having item to
  // build complete category rows, per home-photo-showcase-plan.md's Row
  // Content and Order section ("No cap on row length"). This function
  // used to carry a .limit(10) sized for a top-10 "recently verified"
  // feed (fetchRecentlyVerified, this file's only other caller of this
  // function before the photo showcase existed); that feed and its cap
  // were removed in Phase 7.1 once nothing called it anymore, so this
  // function has stayed uncapped since.
  const { data, error } = await supabase
    .from("places")
    .select(
      "id, name, description, latitude, longitude, verification_status, verified_at, place_categories(name, icon), facility_ids"
    )
    .not("verified_at", "is", null)
    .order("verified_at", { ascending: false });

  if (error) throw error;

  // home-photo-showcase-phases.md Phase 2.2: cover photo fetched via
  // 2.1's helper, one extra query keyed off the same ids this function
  // already fetched, setting coverPhotoUrl (Phase 1.1's new field). The
  // verified-only, verified_at-sorted query above is otherwise unchanged.
  const coverPhotos = await fetchCoverPhotoUrls(
    "place_photos",
    "place_id",
    (data ?? []).map((row) => row.id)
  );

  // Phase 2 (feature-request-phases.md, Discover Facility Filters):
  // DiscoverPlace (which RecentlyVerifiedPlace extends) gained a required
  // facility_ids field. Widened this select and mapping the same way
  // discover-query.ts's fetchPlaces and saved-places.ts's fetchSavedPlaces
  // both were, keeping every DiscoverPlace constructor in sync rather than
  // leaving this one to silently miss the field.
  //
  // Map-marker-icons phase: same discipline, same fix, for the new
  // required categoryIcon field -- place_categories(name, icon) now widens
  // this select too, kept in sync with discover-query.ts's fetchPlaces and
  // saved-places.ts's fetchSavedPlaces.
  return (data ?? []).map((row) => ({
    kind: "place" as const,
    id: row.id,
    name: row.name,
    category: readEmbeddedName(row.place_categories) ?? "",
    categoryIcon: readEmbeddedIcon(row.place_categories),
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    verification_status: row.verification_status as "verified",
    verified_at: row.verified_at as string,
    facility_ids: row.facility_ids ?? [],
    coverPhotoUrl: coverPhotos.get(row.id) ?? null,
  }));
}

async function fetchRecentlyVerifiedBusinesses(): Promise<RecentlyVerifiedBusiness[]> {
  // Category Directory Expansion, Phase 1.7: category is now a joined
  // business_categories.name (migration 0027, category_id replaces the
  // old plain text column), embedded and flattened the same way
  // fetchRecentlyVerifiedPlaces above already handles place_categories.
  // Not one of the expansion phases doc's own enumerated 1.7 consumers,
  // but the same display-only reasoning applies (this feed never writes a
  // category back) -- caught here since the old flat "category" select
  // would otherwise error against the dropped column, per constraints.md's
  // File Traversal rule.
  // home-photo-showcase-phases.md Phase 2.3/7.1: same reasoning as
  // fetchRecentlyVerifiedPlaces above -- no row limit, this function's
  // only caller now is fetchHomeShowcase, which needs the full verified
  // set to build complete category rows.
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, business_categories(name, icon), description, latitude, longitude, verification_status, verified_at, business_items(price)"
    )
    .eq("verification_status", "verified")
    .not("verified_at", "is", null)
    .order("verified_at", { ascending: false });

  if (error) throw error;

  // home-photo-showcase-phases.md Phase 2.2: same cover-photo widening as
  // fetchRecentlyVerifiedPlaces above, business_photos this time.
  const coverPhotos = await fetchCoverPhotoUrls(
    "business_photos",
    "business_id",
    (data ?? []).map((row) => row.id)
  );

  return (data ?? []).map((row) => {
    const { business_categories, ...rest } = row as typeof row & {
      business_categories: { name: string; icon: string } | { name: string; icon: string }[] | null;
    };
    return {
      kind: "business" as const,
      id: rest.id,
      name: rest.name,
      category: readEmbeddedName(business_categories),
      // Map-marker-icons phase: same embed, second field read off it, same
      // fix as discover-query.ts's fetchBusinesses and saved-places.ts.
      categoryIcon: readEmbeddedIcon(business_categories),
      description: rest.description,
      latitude: rest.latitude,
      longitude: rest.longitude,
      verification_status: "verified" as const,
      itemPrices: (rest.business_items ?? []).map((item: { price: number | null }) => item.price),
      verified_at: rest.verified_at as string,
      coverPhotoUrl: coverPhotos.get(rest.id) ?? null,
    };
  });
}

/**
 * home-photo-showcase-phases.md Phase 2.3: one function replacing the two
 * originally planned, fetches once and splits after -- no second round
 * trip for the same rows.
 *
 * Grouping key: the plan's own language says "by category_id," but
 * RecentlyVerifiedPlace/RecentlyVerifiedBusiness (home-types.ts Phase 1,
 * already locked, not this phase's file to change) carry `category` as a
 * resolved name string, not a category_id -- readEmbeddedName already
 * flattened the join in fetchRecentlyVerifiedPlaces/Businesses above, per
 * those functions' own pre-existing comments, and every other consumer of
 * these two types across the app (verified-item-card.tsx, Discover's own
 * filterDiscoverResults) reads that same resolved name, never a raw id.
 * Re-widening either type to also carry category_id now, just for this
 * grouping step, would ripple a field into Discover's own result shape
 * for a use Discover never has, the same reasoning home-types.ts's own
 * header comment already gives for keeping verified_at/coverPhotoUrl
 * scoped to Home alone. So grouping here joins on category name instead:
 * each active category's own `name` (from fetchActiveCategories) matched
 * against each item's own `category` field. Two categories never share a
 * name (place_categories.name / business_categories.name have no unique
 * constraint forcing that, but category-form-dialog.tsx's own admin form
 * is the only write path and categories are managed per CATO's own
 * naming), and within one kind (places or businesses) this is exactly the
 * same identity a name-based join already relies on elsewhere in this
 * file (readEmbeddedName itself resolves a category to its name, not its
 * id, before any caller ever sees the row).
 */
export interface HomeShowcase {
  placeCategoryRows: CategoryRow[];
  businessCategoryRows: CategoryRow[];
  fallbackItems: RecentlyVerifiedItem[];
}

function buildCategoryRows<T extends RecentlyVerifiedItem>(
  categories: { id: string; name: string }[],
  items: T[]
): { rows: CategoryRow[]; photoless: T[] } {
  const photoless: T[] = [];
  const byCategoryName = new Map<string, T[]>();

  for (const item of items) {
    if (!item.coverPhotoUrl) {
      photoless.push(item);
      continue;
    }
    const key = item.category ?? "";
    const bucket = byCategoryName.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      byCategoryName.set(key, [item]);
    }
  }

  // Categories iterated in the order they were passed in (fetchActive
  // Categories' own alphabetical-by-name order, confirmed Phase 0.1), so
  // rows come out already in that order -- no re-sort needed here. A
  // category with zero photo-having items simply has no entry in
  // byCategoryName, so it's dropped from rows for free by this filter,
  // never pushed as an empty row.
  const rows: CategoryRow[] = [];
  for (const category of categories) {
    const bucket = byCategoryName.get(category.name);
    if (!bucket || bucket.length === 0) continue;
    rows.push({
      categoryId: category.id,
      categoryName: category.name,
      items: [...bucket].sort(
        (a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime()
      ),
    });
  }

  return { rows, photoless };
}

export async function fetchHomeShowcase(): Promise<HomeShowcase> {
  const [placeCategories, businessCategories, places, businesses] = await Promise.all([
    fetchActivePlaceCategories(),
    fetchActiveBusinessCategories(),
    fetchRecentlyVerifiedPlaces(),
    fetchRecentlyVerifiedBusinesses(),
  ]);

  const { rows: placeCategoryRows, photoless: photolessPlaces } = buildCategoryRows(
    placeCategories,
    places
  );
  const { rows: businessCategoryRows, photoless: photolessBusinesses } = buildCategoryRows(
    businessCategories,
    businesses
  );

  const fallbackItems = [...photolessPlaces, ...photolessBusinesses].sort(
    (a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime()
  );

  return { placeCategoryRows, businessCategoryRows, fallbackItems };
}
