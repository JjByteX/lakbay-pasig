// Itinerary generator, planning core. Pure TypeScript: no database calls, no
// React, no supabase.ts. Plan: Lakbay_Pasig_Itinerary_Generator_Plan.md,
// sections 3 and 4.
//
// Utility, travel time and feasibility are separate functions on purpose, so
// each can be swapped later (finer taste tiers, road-based legs, a solver in
// place of greedy insertion) without touching the rest.
//
// Imports use explicit .ts extensions and avoid the @/ alias so
// scripts/itinerary-check.mjs can load this file in plain Node. Only types come
// from directions.ts (erased at runtime), since it is a routing module.

import { distanceKm } from "./geo.ts";
import type { LatLng } from "./geo.ts";
import { DAYS, MINUTES_PER_DAY, manilaClock, parseDurationMinutes, parseHoursValue, timeToMinutes } from "./hours.ts";
import type { ParsedHours, TimeRange } from "./hours.ts";
import type { TravelMode } from "./directions.ts";

// ---------------------------------------------------------------------------
// Constants (plan 3.4)
// ---------------------------------------------------------------------------

export const SPEED_KMH: Record<TravelMode, number> = { foot: 4.5, bike: 12, car: 20 };
export const DETOUR_FACTOR = 1.3;
export const DEFAULT_PLACE_DWELL = 45;
export const DEFAULT_BUSINESS_DWELL = 30;
export const MIN_VISIT_MINUTES = 15;
export const MAX_WAIT_MINUTES = 15;
export const MAX_STOPS = 12;
export const PREFILTER_LIMIT = 100;

export type Tier = 1 | 2 | 3;
export const TIER_UTILITY: Record<Tier, number> = { 1: 1, 2: 0.6, 3: 0.3 };

// Floating point slack for the budget comparison.
const EPSILON = 1e-9;
// Keeps u / added finite if a trial ever adds no time.
const MIN_ADDED_MINUTES = 0.01;

export type ItemKind = "place" | "business";

// "kind:id". Local copy of the helper in recommendations.ts, which cannot be
// imported here (it pulls in supabase.ts and React).
export function itemKeyOf(kind: ItemKind, id: string): string {
  return `${kind}:${id}`;
}

// ---------------------------------------------------------------------------
// Start point (plan section 2)
// ---------------------------------------------------------------------------

// [west, south, east, north], the shape of PASIG_BOUNDS in map-style.ts. Passed
// in rather than imported, since map-style.ts is map code.
export type Bounds = readonly [west: number, south: number, east: number, north: number];

export type StartCheck =
  | { ok: true; start: LatLng }
  | { ok: false; reason: "no_location" | "outside_pasig"; message: string };

function isFiniteLatLng(point: LatLng | null | undefined): point is LatLng {
  return point != null && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

export function checkStart(start: LatLng | null | undefined, bounds: Bounds): StartCheck {
  if (!isFiniteLatLng(start)) {
    return { ok: false, reason: "no_location", message: "Choose a starting point to plan a trail." };
  }
  const [west, south, east, north] = bounds;
  const inside =
    start.longitude >= west && start.longitude <= east && start.latitude >= south && start.latitude <= north;
  if (!inside) {
    return { ok: false, reason: "outside_pasig", message: "Start points must be inside Pasig." };
  }
  return { ok: true, start };
}

// ---------------------------------------------------------------------------
// Pool and tiers (plan 3.1, 3.2 step 1)
// ---------------------------------------------------------------------------

// One place or business as the data layer will hand it over (build order
// steps 3 and 5 fill this in). recommendedRank is the 0-based position in the
// recommender's result list, null when the recommender did not return it.
export interface PoolItem {
  kind: ItemKind;
  id: string;
  name: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Raw stored hours text (places.operating_hours, businesses.opening_hours). */
  hours: string | null;
  /** Raw places.visit_duration text. Businesses have no such field. */
  visitDuration: string | null;
  saved: boolean;
  recommendedRank: number | null;
  /** A business still pending CATO review. Display only: it never changes the ranking (decision 9). */
  pending?: boolean;
}

// Bounded-query items plus the user's saved items, one entry per item. Anything
// in `saved` is marked saved, so it is tier 1 even when it came from the query
// too or lies outside the query's box.
export function mergePool(queried: PoolItem[], saved: PoolItem[]): PoolItem[] {
  const merged = new Map<string, PoolItem>();
  for (const item of queried) merged.set(itemKeyOf(item.kind, item.id), item);
  for (const item of saved) merged.set(itemKeyOf(item.kind, item.id), { ...item, saved: true });
  return [...merged.values()];
}

// 1 = top third of the recommender's list, 2 = top two thirds, 3 = not listed.
function recommenderBand(rank: number | null, size: number): 1 | 2 | 3 {
  if (rank === null || size <= 0) return 3;
  if (rank < Math.ceil(size / 3)) return 1;
  if (rank < Math.ceil((size * 2) / 3)) return 2;
  return 3;
}

// Plan 3.1. Interest matching compares category names, the way onboarding
// writes preferred_categories and recommend_items reads them.
export function tierOf(item: PoolItem, interests: ReadonlySet<string>, recommenderSize: number): Tier {
  if (item.saved) return 1;
  const matches = item.category != null && interests.has(item.category);
  const band = recommenderBand(item.recommendedRank, recommenderSize);
  if (matches && band === 1) return 1;
  if (matches || band <= 2) return 2;
  return 3;
}

// Parsed visit_duration for places, else the default. Businesses always use
// the business default.
export function resolveDwellMinutes(kind: ItemKind, visitDuration: string | null): number {
  if (kind === "business") return DEFAULT_BUSINESS_DWELL;
  const parsed = visitDuration ? parseDurationMinutes(visitDuration) : null;
  return parsed != null && parsed > 0 ? parsed : DEFAULT_PLACE_DWELL;
}

export interface Candidate {
  key: string;
  kind: ItemKind;
  id: string;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  /** Raw stored hours text. */
  hours: string | null;
  dwellMinutes: number;
  tier: Tier;
}

// Drops items with no coordinates, then attaches tier and dwell. `interests`
// are category names. `recommenderSize` is the length of the recommender list
// the ranks refer to.
export function buildCandidates(
  pool: PoolItem[],
  interests: readonly string[],
  recommenderSize: number
): Candidate[] {
  const wanted = new Set(interests);
  const candidates: Candidate[] = [];
  for (const item of pool) {
    if (item.latitude == null || item.longitude == null) continue;
    candidates.push({
      key: itemKeyOf(item.kind, item.id),
      kind: item.kind,
      id: item.id,
      name: item.name,
      category: item.category,
      latitude: item.latitude,
      longitude: item.longitude,
      hours: item.hours,
      dwellMinutes: resolveDwellMinutes(item.kind, item.visitDuration),
      tier: tierOf(item, wanted, recommenderSize),
    });
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Travel (plan 3.1)
// ---------------------------------------------------------------------------

export interface Leg {
  km: number;
  minutes: number;
}

// Straight-line estimate used while searching. Road distance and time from
// OSRM replace it for the final route only (build order step 4).
export function estimateLeg(from: LatLng, to: LatLng, mode: TravelMode): Leg {
  const km = distanceKm(from, to) * DETOUR_FACTOR;
  return { km, minutes: (km / SPEED_KMH[mode]) * 60 };
}

// ---------------------------------------------------------------------------
// Hours check, open on arrival (plan 3.3)
// ---------------------------------------------------------------------------

export type HoursTag = "open" | "closes_soon" | "hours_not_confirmed";

export type ArrivalCheck =
  | { feasible: false }
  | {
      feasible: true;
      tag: HoursTag;
      /** Minutes spent waiting for the stop to open. Counts toward the budget. */
      waitMinutes: number;
      /** Minutes actually spent at the stop: the full dwell, or less if it closes first. */
      stayMinutes: number;
    };

// Whether a visit starting at `t` (minutes into the day) fits one opening
// range. A range includes its opening minute and excludes its closing minute,
// but a visit may end exactly at closing.
function fitInRange(range: TimeRange, t: number, dwell: number): ArrivalCheck {
  const opens = timeToMinutes(range[0]);
  const closes = timeToMinutes(range[1]);
  const visitStart = Math.max(t, opens);
  const wait = visitStart - t;
  if (wait > MAX_WAIT_MINUTES || visitStart >= closes) return { feasible: false };
  if (visitStart + Math.min(MIN_VISIT_MINUTES, dwell) > closes) return { feasible: false };
  const stay = Math.min(dwell, closes - visitStart);
  return { feasible: true, tag: stay < dwell ? "closes_soon" : "open", waitMinutes: wait, stayMinutes: stay };
}

/**
 * Plan 3.3. `arrive` is minutes since midnight of the start day (it may pass
 * 1440 on a late trip); `startDayIndex` is that day's index in DAYS. Unknown
 * hours (none, or legacy free text) are feasible and tagged, never treated as
 * confirmed open. Temporarily or permanently closed is infeasible. Several
 * ranges on one day are a split shift.
 */
export function checkOpenOnArrival(
  hours: ParsedHours,
  arrive: number,
  dwell: number,
  startDayIndex: number
): ArrivalCheck {
  if (hours.kind !== "schedule") {
    return { feasible: true, tag: "hours_not_confirmed", waitMinutes: 0, stayMinutes: dwell };
  }
  if (hours.mode !== "main") return { feasible: false };

  const dayOffset = Math.floor(arrive / MINUTES_PER_DAY);
  const ranges = hours.days[DAYS[(startDayIndex + dayOffset) % DAYS.length].key];
  const t = arrive - dayOffset * MINUTES_PER_DAY;
  for (const range of ranges) {
    const fit = fitInRange(range, t, dwell);
    if (fit.feasible) return fit;
  }
  return { feasible: false };
}

// ---------------------------------------------------------------------------
// Route evaluation
// ---------------------------------------------------------------------------

export interface PlannedStop {
  candidate: Candidate;
  /** Estimated road km of the leg that reaches this stop. */
  legKm: number;
  legMinutes: number;
  /** Minutes since midnight of the start day. */
  arriveMinutes: number;
  waitMinutes: number;
  departMinutes: number;
  tag: HoursTag;
}

export interface Itinerary {
  stops: PlannedStop[];
  /** Start to the end of the last stop, waits included. */
  totalMinutes: number;
  totalKm: number;
  utilitySum: number;
  startMinutes: number;
}

interface Prepared {
  candidate: Candidate;
  hours: ParsedHours;
  utility: number;
}

interface PlanContext {
  start: LatLng;
  mode: TravelMode;
  startMinutes: number;
  startDayIndex: number;
  budgetMinutes: number;
}

function prepare(candidate: Candidate): Prepared {
  return { candidate, hours: parseHoursValue(candidate.hours), utility: TIER_UTILITY[candidate.tier] };
}

type RouteEvaluation = { ok: true; itinerary: Itinerary } | { ok: false; failedIndex: number };

// Arrival times for a route in the order given, or the index of the first stop
// that fails the hours check or pushes the trip past the budget. Stop count is
// limited by the caller. `legs` are the legs to use, one per stop (road
// numbers from routing); without them every leg is the straight-line estimate.
function evaluateRouteDetailed(ctx: PlanContext, order: Prepared[], legs?: readonly Leg[]): RouteEvaluation {
  const stops: PlannedStop[] = [];
  let from = ctx.start;
  let clock = ctx.startMinutes;
  let totalKm = 0;
  let utilitySum = 0;

  for (const [index, item] of order.entries()) {
    const leg = legs?.[index] ?? estimateLeg(from, item.candidate, ctx.mode);
    const arrive = clock + leg.minutes;
    const check = checkOpenOnArrival(item.hours, arrive, item.candidate.dwellMinutes, ctx.startDayIndex);
    if (!check.feasible) return { ok: false, failedIndex: index };

    const depart = arrive + check.waitMinutes + check.stayMinutes;
    if (depart - ctx.startMinutes > ctx.budgetMinutes + EPSILON) return { ok: false, failedIndex: index };

    stops.push({
      candidate: item.candidate,
      legKm: leg.km,
      legMinutes: leg.minutes,
      arriveMinutes: arrive,
      waitMinutes: check.waitMinutes,
      departMinutes: depart,
      tag: check.tag,
    });
    totalKm += leg.km;
    utilitySum += item.utility;
    clock = depart;
    from = item.candidate;
  }
  return {
    ok: true,
    itinerary: { stops, totalMinutes: clock - ctx.startMinutes, totalKm, utilitySum, startMinutes: ctx.startMinutes },
  };
}

// The search's check: an itinerary, or null when the route does not fit.
function evaluateRoute(ctx: PlanContext, order: Prepared[]): Itinerary | null {
  const result = evaluateRouteDetailed(ctx, order);
  return result.ok ? result.itinerary : null;
}

// ---------------------------------------------------------------------------
// Prefilter (plan 3.2 step 2)
// ---------------------------------------------------------------------------

// Closest-first among equal scores would be arbitrary, so ties break on key.
function compareByValue(a: { key: string; value: number }, b: { key: string; value: number }): number {
  if (a.value !== b.value) return b.value - a.value;
  return a.key < b.key ? -1 : 1;
}

/**
 * Drops candidates whose estimated travel time from the start exceeds half the
 * budget, then keeps the best `limit` by utility divided by distance. Output
 * order is deterministic.
 */
export function prefilterCandidates(
  start: LatLng,
  candidates: Candidate[],
  budgetMinutes: number,
  mode: TravelMode,
  limit: number = PREFILTER_LIMIT
): Candidate[] {
  const scored: { candidate: Candidate; key: string; value: number }[] = [];
  for (const candidate of candidates) {
    const leg = estimateLeg(start, candidate, mode);
    if (leg.minutes > budgetMinutes / 2) continue;
    // A 100 m floor stops an item at the start from dividing by ~0.
    const value = TIER_UTILITY[candidate.tier] / Math.max(leg.km, 0.1);
    scored.push({ candidate, key: candidate.key, value });
  }
  scored.sort(compareByValue);
  return scored.slice(0, limit).map((entry) => entry.candidate);
}

// ---------------------------------------------------------------------------
// Greedy insertion (plan 3.2 step 3)
// ---------------------------------------------------------------------------

interface Insertion {
  candidate: Prepared;
  route: Prepared[];
  itinerary: Itinerary;
  added: number;
  score: number;
}

function isBetter(a: Insertion, b: Insertion): boolean {
  if (a.score !== b.score) return a.score > b.score;
  return a.added < b.added;
}

// Cheapest feasible position for one candidate: the one with the best
// utility per added minute.
function bestPositionFor(
  ctx: PlanContext,
  route: Prepared[],
  current: Itinerary,
  candidate: Prepared
): Insertion | null {
  let best: Insertion | null = null;
  for (let position = 0; position <= route.length; position += 1) {
    const trial = [...route.slice(0, position), candidate, ...route.slice(position)];
    const itinerary = evaluateRoute(ctx, trial);
    if (!itinerary) continue;
    const added = Math.max(itinerary.totalMinutes - current.totalMinutes, MIN_ADDED_MINUTES);
    const next: Insertion = { candidate, route: trial, itinerary, added, score: candidate.utility / added };
    if (best === null || isBetter(next, best)) best = next;
  }
  return best;
}

function bestInsertion(
  ctx: PlanContext,
  route: Prepared[],
  current: Itinerary,
  remaining: Prepared[]
): Insertion | null {
  let best: Insertion | null = null;
  for (const candidate of remaining) {
    const option = bestPositionFor(ctx, route, current, candidate);
    if (option && (best === null || isBetter(option, best))) best = option;
  }
  return best;
}

function emptyItinerary(ctx: PlanContext): Itinerary {
  return { stops: [], totalMinutes: 0, totalKm: 0, utilitySum: 0, startMinutes: ctx.startMinutes };
}

function insertGreedily(ctx: PlanContext, candidates: Candidate[]): Itinerary {
  let remaining = candidates.map(prepare);
  let route: Prepared[] = [];
  let current = emptyItinerary(ctx);

  while (route.length < MAX_STOPS && remaining.length > 0) {
    const best = bestInsertion(ctx, route, current, remaining);
    if (!best) break;
    route = best.route;
    current = best.itinerary;
    remaining = remaining.filter((item) => item !== best.candidate);
  }
  return current;
}

function contextOf(input: PlanInput): PlanContext {
  const clock = manilaClock(input.startTime);
  return {
    start: input.start,
    mode: input.mode,
    startMinutes: clock.minutes,
    startDayIndex: clock.dayIndex,
    budgetMinutes: input.budgetMinutes,
  };
}

export interface PlanInput {
  start: LatLng;
  /** The trip's start moment. Read on the Asia/Manila clock. Pass it in so a run is repeatable. */
  startTime: Date;
  budgetMinutes: number;
  mode: TravelMode;
  candidates: Candidate[];
}

/**
 * Plan 3.2 steps 2, 3 and 5 on straight-line travel estimates: prefilter, then
 * greedy insertion by utility per added minute. Every stop passes the hours
 * check at its arrival, total time stays within the budget, and the route has
 * at most MAX_STOPS stops. Does not call routing. An empty pool gives an empty
 * route.
 */
export function planItinerary(input: PlanInput): Itinerary {
  const ctx = contextOf(input);
  if (ctx.startDayIndex < 0 || input.budgetMinutes <= 0) return emptyItinerary(ctx);

  const pool = prefilterCandidates(input.start, input.candidates, input.budgetMinutes, input.mode);
  return insertGreedily(ctx, pool);
}

// ---------------------------------------------------------------------------
// Refine on road numbers (plan 3.2 step 4)
// ---------------------------------------------------------------------------

/**
 * Road legs for a route, one per stop in order: start to the first stop, then
 * each stop to the next. Null when routing is unavailable. Passed in so this
 * file stays free of network code (itinerary-data.ts supplies the real one).
 */
export type RoadLegsFetcher = (start: LatLng, stops: Candidate[], mode: TravelMode) => Promise<Leg[] | null>;

export interface GeneratedItinerary {
  itinerary: Itinerary;
  /** True when the arrival times use road numbers, false when they are straight-line estimates. */
  roadChecked: boolean;
}

async function roadLegsOrNull(
  fetchLegs: RoadLegsFetcher,
  start: LatLng,
  stops: Candidate[],
  mode: TravelMode
): Promise<Leg[] | null> {
  try {
    const legs = await fetchLegs(start, stops, mode);
    return legs?.length === stops.length ? legs : null;
  } catch {
    return null;
  }
}

// The stops before `failedIndex`, which passed on these legs. If that somehow
// does not hold, an empty route is the safe answer.
function prefixItinerary(ctx: PlanContext, order: Prepared[], legs: Leg[], failedIndex: number): Itinerary {
  const result = evaluateRouteDetailed(ctx, order.slice(0, failedIndex), legs.slice(0, failedIndex));
  return result.ok ? result.itinerary : emptyItinerary(ctx);
}

/**
 * Plans on straight-line estimates, then checks the chosen route once on road
 * distance and time. If a stop now fails (closed on arrival, or over budget),
 * that stop is dropped and the plan runs once more without it, with one more
 * road check. If that second route still fails, the stops before the first
 * failure are kept, using the legs already fetched, so there are at most two
 * routing calls per trip. When routing is unavailable the straight-line plan
 * is returned with roadChecked false.
 */
export async function generateItinerary(input: PlanInput, fetchLegs: RoadLegsFetcher): Promise<GeneratedItinerary> {
  const ctx = contextOf(input);
  let candidates = input.candidates;
  let plan = planItinerary(input);

  for (let round = 0; round < 2 && plan.stops.length > 0; round += 1) {
    const legs = await roadLegsOrNull(
      fetchLegs,
      input.start,
      plan.stops.map((stop) => stop.candidate),
      input.mode
    );
    if (!legs) return { itinerary: plan, roadChecked: false };

    const order = plan.stops.map((stop) => prepare(stop.candidate));
    const result = evaluateRouteDetailed(ctx, order, legs);
    if (result.ok) return { itinerary: result.itinerary, roadChecked: true };
    if (round === 1) return { itinerary: prefixItinerary(ctx, order, legs, result.failedIndex), roadChecked: true };

    const failedKey = plan.stops[result.failedIndex].candidate.key;
    candidates = candidates.filter((candidate) => candidate.key !== failedKey);
    plan = planItinerary({ ...input, candidates });
  }
  return { itinerary: plan, roadChecked: false };
}
