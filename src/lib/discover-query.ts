import { supabase } from "./supabase";
import type { DiscoverBusiness, DiscoverPlace, DiscoverResult } from "./discover-types";

// Phase 3.1: places (places_select_public, migration 0003, verified only,
// unchanged this step) and businesses (businesses_select_public, migration
// 0015, verified or pending) fetched separately since they're different
// tables with different RLS-visible statuses, then combined in
// fetchDiscoverResults. Both policies are public-select, so this runs the
// same for a Guest session and a signed-in one. Field list is summary-only:
// name, category, coordinates, verification_status, plus a one-line
// description for the result card. Full detail fields are Phase 6's concern.
async function fetchPlaces(): Promise<DiscoverPlace[]> {
  const { data, error } = await supabase
    .from("places")
    .select("id, name, category, description, latitude, longitude, verification_status");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    kind: "place" as const,
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    // places_select_public only ever returns verified rows, but the column
    // itself is typed text at the DB layer, so this is a narrowing cast
    // consistent with what RLS guarantees, not an unchecked assumption.
    verification_status: row.verification_status as "verified",
  }));
}

async function fetchBusinesses(): Promise<DiscoverBusiness[]> {
  // Phase 7.1: business_items joined in the same query, embedded select
  // per Supabase's foreign-table syntax, rather than a second round-trip
  // per business. business_items_select_public (migration 0016) already
  // follows the parent business's own visibility (verified or pending), so
  // this embed returns exactly the rows Discover is allowed to see, no
  // extra filtering needed here for RLS reasons.
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, category, description, latitude, longitude, verification_status, business_items(price)"
    );

  if (error) throw error;

  return (data ?? []).map((row) => ({
    kind: "business" as const,
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    verification_status: row.verification_status as "verified" | "pending",
    itemPrices: (row.business_items ?? []).map((item: { price: number | null }) => item.price),
  }));
}

/**
 * Phase 3.2: combined result set Discover renders from. One call, one typed
 * list, per step-5-plan.md's Shape section (one combined view, not separate
 * data paths per surface).
 */
export async function fetchDiscoverResults(): Promise<DiscoverResult[]> {
  const [places, businesses] = await Promise.all([fetchPlaces(), fetchBusinesses()]);
  return [...places, ...businesses];
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Phase 3.3: straight-line (haversine) distance in kilometers. This is a
// sort order for a list, not turn-by-turn routing, per step-5-phases.md, so
// great-circle distance is sufficient, no routing API needed.
//
// Exported as of Step 7, Phase 4.5: trail-detail.tsx's proximity unlock
// check reuses this exact function rather than reimplementing haversine a
// second time, per step-7-phases.md's own 4.5 instruction ("same distanceKm
// logic already in discover-query.ts, reused not reinvented") and
// constraints.md's Inventory Before Suggesting rule.
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Phase 3.3: sort by distance when a user coordinate is known, by name
 * otherwise, per step-5-plan.md's List view behavior. Does not mutate the
 * input array.
 */
export function sortDiscoverResults(
  results: DiscoverResult[],
  userLocation: Coordinates | null
): DiscoverResult[] {
  if (!userLocation) {
    return [...results].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Results with no coordinates on record can't be distance-sorted, they
  // sink to the end (by name among themselves) rather than being dropped,
  // since step-5-plan.md's list view still shows every result, sort order
  // is the only thing distance affects.
  const withCoords: { result: DiscoverResult; distance: number }[] = [];
  const withoutCoords: DiscoverResult[] = [];

  for (const result of results) {
    if (result.latitude != null && result.longitude != null) {
      withCoords.push({
        result,
        distance: distanceKm(userLocation, { latitude: result.latitude, longitude: result.longitude }),
      });
    } else {
      withoutCoords.push(result);
    }
  }

  withCoords.sort((a, b) => a.distance - b.distance);
  withoutCoords.sort((a, b) => a.name.localeCompare(b.name));

  return [...withCoords.map((entry) => entry.result), ...withoutCoords];
}

/**
 * Phase 5.3-5.4, 7.1-7.2 (step-5-phases.md): narrows the combined result
 * set by name search (in place, no separate search page per step-5-plan.md
 * section 1), by category (DISCOVER_CATEGORIES, discover-types.ts), and by
 * price range (businesses only). All three apply to the same set that
 * feeds the map markers and the list together, per step-5-plan.md's Shape
 * section. Search matches on name only, case-insensitive substring, per
 * step-5-plan.md's "filters both map markers and the list by name." Empty
 * query, null category, and null priceRange are all no-ops so the base
 * list still shows everything, matching vendor-mode-spec.md's Filter
 * Behavior line that a filter narrows, it never hides by default.
 *
 * Price range (Phase 7.1): narrows to businesses with at least one item
 * priced inside [min, max] inclusive; a place never has itemPrices to
 * match, so it's excluded whenever the price filter is active, per
 * step-5-plan.md section 3 scoping this filter to businesses. Phase 7.2:
 * an item with a null price is skipped by this specific check only, it
 * never counts as a "no match" that would hide the whole business, per
 * vendor-mode-spec.md's Filter Behavior line, a business with some priced
 * and some unpriced items still appears as long as one priced item is in
 * range.
 */
export function filterDiscoverResults(
  results: DiscoverResult[],
  query: string,
  category: string | null,
  priceRange: { min: number | null; max: number | null } | null = null
): DiscoverResult[] {
  const q = query.trim().toLowerCase();

  return results.filter((result) => {
    if (q && !result.name.toLowerCase().includes(q)) return false;
    if (category && result.category !== category) return false;

    if (priceRange) {
      if (result.kind !== "business") return false;
      const min = priceRange.min ?? -Infinity;
      const max = priceRange.max ?? Infinity;
      const hasMatchingItem = result.itemPrices.some(
        (price) => price != null && price >= min && price <= max
      );
      if (!hasMatchingItem) return false;
    }

    return true;
  });
}
