import { fetchDiscoverResults, POOL_PAGE_SIZE } from "./discover-query";
import { fetchStopHours, fetchVisitDurations } from "./personal-trails";
import { fetchSavedPlaceIds } from "./saved-places";
import { fetchSavedBusinessIds } from "./saved-businesses";
import { fetchRecommendations, itemKey } from "./recommendations";
import { fetchRoute } from "./directions";
import { boundsAround } from "./geo";
import type { LatLng } from "./geo";
import { DETOUR_FACTOR, SPEED_KMH, buildCandidates, generateItinerary, mergePool } from "./itinerary";
import type { GeneratedItinerary, PoolItem, RoadLegsFetcher } from "./itinerary";
import type { TravelMode } from "./directions";
import type { DiscoverResult } from "./discover-types";

/**
 * Itinerary generator, data side (plan section 4, build order steps 3 to 5).
 * The planning core in itinerary.ts stays free of database and network calls;
 * this file is the only place the pool, the taste signal and road legs are
 * read, and suggestTrip is the one call the generator page makes.
 */

/**
 * How far from the start an item can be and still survive itinerary.ts's
 * prefilter: straight-line travel time at most half the budget, where
 * straight-line km are multiplied by the detour factor. Reading beyond this
 * radius would only load rows the prefilter then drops.
 */
export function poolRadiusKm(budgetMinutes: number, mode: TravelMode): number {
  const roadKm = (budgetMinutes / 2 / 60) * SPEED_KMH[mode];
  return roadKm / DETOUR_FACTOR;
}

/**
 * Adds stored hours and visit durations to Discover results, giving the
 * planner's PoolItem shape. Hours come from fetchStopHours (places and
 * businesses), durations from fetchVisitDurations (places only). Both read in
 * batches, so any number of results is fine. Results not saved and not ranked
 * by the recommender: those fields are filled in later by the caller.
 */
export async function fetchPoolItems(results: DiscoverResult[]): Promise<PoolItem[]> {
  if (results.length === 0) return [];

  const [hours, durations] = await Promise.all([
    fetchStopHours(results.map((r) => ({ type: r.kind, id: r.id }))),
    fetchVisitDurations(results.filter((r) => r.kind === "place").map((r) => r.id)),
  ]);

  return results.map((r) => ({
    kind: r.kind,
    id: r.id,
    name: r.name,
    category: r.category || null,
    latitude: r.latitude,
    longitude: r.longitude,
    hours: hours.get(r.id) ?? null,
    visitDuration: r.kind === "place" ? (durations.get(r.id) ?? null) : null,
    saved: false,
    recommendedRank: null,
    pending: r.verification_status === "pending",
  }));
}

/**
 * The generator's candidate pool: visible places and businesses (businesses
 * verified or pending, as RLS allows, decision 9) inside the box around the
 * start that the trip could reach, read in pages of POOL_PAGE_SIZE with no
 * cover photos, then given hours and visit durations. Items with no
 * coordinates fall outside any box and are never read.
 */
export async function fetchItineraryPool(
  start: LatLng,
  budgetMinutes: number,
  mode: TravelMode
): Promise<PoolItem[]> {
  const results = await fetchDiscoverResults({
    bounds: boundsAround(start, poolRadiusKm(budgetMinutes, mode)),
    pageSize: POOL_PAGE_SIZE,
    coverPhotos: false,
  });
  return fetchPoolItems(results);
}

/**
 * Road legs for the final route in one routing call (build order step 4):
 * start to the first stop, then stop to stop. Meters become km and seconds
 * become minutes. Null when the service gives no legs. A routing failure
 * throws, and generateItinerary treats that as "keep the estimates".
 */
export const fetchRoadLegs: RoadLegsFetcher = async (start, stops, mode) => {
  const last = stops.at(-1);
  if (!last) return [];
  const route = await fetchRoute(start, last, mode, stops.slice(0, -1));
  return route.legs ? route.legs.map((leg) => ({ km: leg.distance / 1000, minutes: leg.duration / 60 })) : null;
};

// Saved items sit in the pool as tier 1. Every saved item the trip could reach
// is inside the query's box already (same radius as the prefilter), so they
// are found by id there. A failed read just means no saved tier.
async function readSavedKeys(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  try {
    const [places, businesses] = await Promise.all([fetchSavedPlaceIds(userId), fetchSavedBusinessIds(userId)]);
    return new Set([
      ...[...places].map((id) => itemKey({ kind: "place", id })),
      ...[...businesses].map((id) => itemKey({ kind: "business", id })),
    ]);
  } catch {
    return new Set();
  }
}

// The recommender is called once, for the taste tiers only. Position in its
// list is the rank. A failed call means no ranks (interests and saved items
// still count).
async function readRecommenderRanks(start: LatLng): Promise<Map<string, number>> {
  try {
    const { cards } = await fetchRecommendations(start, undefined, 30);
    return new Map(cards.map((card, index) => [itemKey(card), index]));
  } catch {
    return new Map();
  }
}

export interface TripRequest {
  start: LatLng;
  budgetMinutes: number;
  mode: TravelMode;
  /** The trip's start moment. */
  startTime: Date;
  /** Category names from the chip row. */
  interests: string[];
  /** Null for a guest: no saved tier. */
  userId: string | null;
}

export interface SuggestedTrip extends GeneratedItinerary {
  /** "kind:id" keys of stops that are pending CATO review, for their badge. */
  pendingKeys: Set<string>;
}

/**
 * The whole generator run: read the pool, the saved ids and the recommender
 * together, tier the candidates, plan, then check the chosen route on road
 * numbers (at most two routing calls). Reads only, nothing is written until
 * the person saves the trail.
 */
export async function suggestTrip(request: TripRequest): Promise<SuggestedTrip> {
  const { start, budgetMinutes, mode, startTime, interests, userId } = request;
  const [queried, savedKeys, ranks] = await Promise.all([
    fetchItineraryPool(start, budgetMinutes, mode),
    readSavedKeys(userId),
    readRecommenderRanks(start),
  ]);

  const ranked = queried.map((item) => ({ ...item, recommendedRank: ranks.get(itemKey(item)) ?? null }));
  const saved = ranked.filter((item) => savedKeys.has(itemKey(item)));
  const pool = mergePool(ranked, saved);
  const candidates = buildCandidates(pool, interests, ranks.size);

  const generated = await generateItinerary(
    { start, startTime, budgetMinutes, mode, candidates },
    fetchRoadLegs
  );
  const pendingKeys = new Set(pool.filter((item) => item.pending).map((item) => itemKey(item)));
  return { ...generated, pendingKeys };
}
