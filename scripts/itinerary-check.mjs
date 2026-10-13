// Checks for src/lib/itinerary.ts. Run: node scripts/itinerary-check.mjs
// (Node 22.18+ reads the .ts files directly, so imports carry the .ts extension.)
// Synthetic fixtures only: no database, no network. The recommender's daily
// shuffle is not exercised here, since ranks are passed in as plain numbers.
import assert from "node:assert/strict";
import { getOpenStatus, manilaClock, minutesToTime, parseHoursValue, serializeHours, DAYS } from "../src/lib/hours.ts";
import {
  MAX_STOPS,
  buildCandidates,
  checkOpenOnArrival,
  checkStart,
  estimateLeg,
  generateItinerary,
  mergePool,
  planItinerary,
  resolveDwellMinutes,
  tierOf,
} from "../src/lib/itinerary.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;
// Tuesday 13 Oct 2026, 9:00 AM Manila (UTC+8, no daylight saving).
const NINE_AM = new Date(Date.UTC(2026, 9, 13, 1, 0));
const START = { latitude: 14.56, longitude: 121.08 };
const PASIG_BOUNDS = [121.03, 14.52, 121.13, 14.62];

const hhmm = (minutes) => minutesToTime(Math.round(minutes) % 1440);
const clock = (h, m = 0) => h * 60 + m;

// The same ranges every day.
function weekly(...ranges) {
  const days = {};
  for (const day of DAYS) days[day.key] = ranges.map(([a, b]) => [a, b]);
  return serializeHours("main", days);
}

function candidate(key, latitude, longitude, tier, dwellMinutes, hours) {
  const [kind, id] = key.split(":");
  return { key, kind, id, name: key, category: null, latitude, longitude, hours, dwellMinutes, tier };
}

const schedule = (...ranges) => parseHoursValue(weekly(...ranges));
const TUE = 1; // index in DAYS

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

assert.deepEqual(manilaClock(NINE_AM), { dayIndex: TUE, minutes: clock(9) });

// ---------------------------------------------------------------------------
// Worked example, plan section 3.5
// ---------------------------------------------------------------------------

const example = [
  candidate("place:P1", 14.564, 121.083, 1, 45, weekly(["09:00", "17:00"])),
  candidate("place:P2", 14.5612, 121.0845, 1, 30, weekly(["06:00", "18:00"])),
  candidate("place:P3", 14.5675, 121.077, 1, 60, weekly(["13:00", "17:00"])),
  candidate("business:B1", 14.5622, 121.079, 2, 30, weekly(["10:00", "20:00"])),
  candidate("business:B2", 14.5603, 121.0812, 3, 20, weekly(["07:00", "19:00"])),
  candidate("business:B3", 14.57, 121.09, 3, 30, weekly(["09:00", "12:00"])),
];
// Tier 2 above stands for u = 0.6 and tier 3 for u = 0.3.

const plan = planItinerary({ start: START, startTime: NINE_AM, budgetMinutes: 180, mode: "foot", candidates: example });
assert.deepEqual(
  plan.stops.map((s) => s.candidate.id),
  ["B2", "P2", "P1", "B1"]
);
assert.deepEqual(
  plan.stops.map((s) => hhmm(s.arriveMinutes)),
  ["09:02", "09:29", "10:05", "10:58"]
);
assert.ok(Math.abs(plan.totalMinutes - 148) < 0.05, `total ${plan.totalMinutes}`);
assert.ok(Math.abs(plan.totalKm - 1.73) < 0.005, `km ${plan.totalKm}`);
assert.ok(Math.abs(plan.utilitySum - 2.9) < 1e-9, `utility ${plan.utilitySum}`);
assert.ok(plan.stops.every((s) => s.tag === "open" && s.waitMinutes === 0));

// ---------------------------------------------------------------------------
// Open-on-arrival rule (plan 3.3), on the helper directly
// ---------------------------------------------------------------------------

const closesAtFive = schedule(["09:00", "17:00"]);
const at = (hours, h, m, dwell) => checkOpenOnArrival(hours, clock(h, m), dwell, TUE);

// 5:00 PM close, 45 min dwell: 4:40 PM is feasible and closes soon.
const late = at(closesAtFive, 16, 40, 45);
assert.equal(late.feasible, true);
assert.equal(late.tag, "closes_soon");
assert.equal(late.stayMinutes, 20); // leaves when it closes
// 4:50 PM: the 15 minute minimum visit does not fit.
assert.equal(at(closesAtFive, 16, 50, 45).feasible, false);
// Exactly the minimum visit before closing still fits.
assert.equal(at(closesAtFive, 16, 45, 45).feasible, true);
// Open all through the dwell: plain "open".
assert.equal(at(closesAtFive, 12, 0, 45).tag, "open");

// Opens in 10 minutes: feasible, wait counted. In 20: infeasible.
const soon = at(closesAtFive, 8, 50, 45);
assert.equal(soon.feasible, true);
assert.equal(soon.waitMinutes, 10);
assert.equal(at(closesAtFive, 8, 40, 45).feasible, false);
assert.equal(at(closesAtFive, 8, 45, 45).feasible, true); // exactly 15 is allowed

// Split shift 8 to 12 and 1 to 5.
const split = schedule(["08:00", "12:00"], ["13:00", "17:00"]);
assert.equal(at(split, 10, 0, 45).tag, "open");
assert.equal(at(split, 14, 0, 45).tag, "open");
const afterBreak = at(split, 12, 55, 45);
assert.equal(afterBreak.feasible, true);
assert.equal(afterBreak.waitMinutes, 5);
assert.equal(at(split, 12, 30, 45).feasible, false); // mid break, 30 min wait
assert.equal(at(split, 11, 50, 45).feasible, false); // too late for the first, too early for the second

// Unknown hours are feasible and tagged, never "open".
for (const raw of [null, "", "Tuesday to Sunday, 9:00 AM – 4:00 PM"]) {
  const unknown = checkOpenOnArrival(parseHoursValue(raw), clock(3), 30, TUE);
  assert.equal(unknown.feasible, true);
  assert.equal(unknown.tag, "hours_not_confirmed");
}

// Closed modes are infeasible.
for (const mode of ["temp_closed", "perm_closed"]) {
  const days = Object.fromEntries(DAYS.map((d) => [d.key, [["00:00", "24:00"]]]));
  assert.equal(checkOpenOnArrival(parseHoursValue(serializeHours(mode, days)), clock(12), 30, TUE).feasible, false);
}

// A closed day, and a trip that runs past midnight into it.
const closedMonday = (() => {
  const days = Object.fromEntries(DAYS.map((d) => [d.key, [["00:00", "24:00"]]]));
  days.mon = [];
  return parseHoursValue(serializeHours("main", days));
})();
assert.equal(checkOpenOnArrival(closedMonday, clock(10), 30, 0).feasible, false); // Monday itself
assert.equal(checkOpenOnArrival(closedMonday, clock(23, 0), 30, 6).feasible, true); // Sunday 11 PM
assert.equal(checkOpenOnArrival(closedMonday, clock(24, 10), 30, 6).feasible, false); // Monday 12:10 AM

// ---------------------------------------------------------------------------
// Budget, stop cap and open-on-arrival on a larger synthetic pool
// ---------------------------------------------------------------------------

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function syntheticPool(count, seed) {
  const random = seeded(seed);
  const hourSets = [
    null,
    "Tuesday to Sunday, 9:00 AM – 4:00 PM",
    weekly(["00:00", "24:00"]),
    weekly(["09:00", "17:00"]),
    weekly(["10:00", "20:00"]),
    weekly(["08:00", "12:00"], ["13:00", "17:00"]),
    weekly(["13:00", "17:00"]),
  ];
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push(
      candidate(
        `${i % 2 === 0 ? "place" : "business"}:S${i}`,
        14.55 + random() * 0.02,
        121.07 + random() * 0.02,
        1 + Math.floor(random() * 3),
        15 + Math.floor(random() * 4) * 15,
        hourSets[Math.floor(random() * hourSets.length)]
      )
    );
  }
  return items;
}

const big = syntheticPool(150, 7);
for (const [budget, mode] of [[120, "foot"], [180, "foot"], [240, "bike"], [360, "car"], [360, "foot"]]) {
  const result = planItinerary({ start: START, startTime: NINE_AM, budgetMinutes: budget, mode, candidates: big });
  assert.ok(result.totalMinutes <= budget + 1e-6, `${mode} ${budget}: total ${result.totalMinutes}`);
  assert.ok(result.stops.length <= MAX_STOPS);
  assert.ok(result.stops.length > 0);
  assert.equal(new Set(result.stops.map((s) => s.candidate.key)).size, result.stops.length); // no repeats

  // Independent oracle: the app's own getOpenStatus must say "open" when the
  // visit starts (arrival plus any wait) for every stop that has structured hours.
  for (const stop of result.stops) {
    const hours = stop.candidate.hours;
    if (parseHoursValue(hours).kind !== "schedule") {
      assert.equal(stop.tag, "hours_not_confirmed");
      continue;
    }
    const visitStart = new Date(NINE_AM.getTime() + (stop.arriveMinutes + stop.waitMinutes - result.startMinutes) * MINUTE_MS);
    assert.equal(getOpenStatus(hours, visitStart)?.open, true, `${stop.candidate.key} closed at arrival`);
    assert.ok(stop.waitMinutes <= 15 + 1e-9);
  }
}

// Same input and pinned clock: same output.
const first = planItinerary({ start: START, startTime: NINE_AM, budgetMinutes: 240, mode: "foot", candidates: big });
const second = planItinerary({ start: START, startTime: NINE_AM, budgetMinutes: 240, mode: "foot", candidates: [...big].reverse() });
assert.equal(JSON.stringify(second), JSON.stringify(first));

// ---------------------------------------------------------------------------
// Small and empty pools
// ---------------------------------------------------------------------------

const base = { start: START, startTime: NINE_AM, budgetMinutes: 180, mode: "foot" };
const empty = planItinerary({ ...base, candidates: [] });
assert.deepEqual(empty.stops, []);
assert.equal(empty.totalMinutes, 0);

const lone = planItinerary({ ...base, candidates: [example[1]] });
assert.deepEqual(lone.stops.map((s) => s.candidate.id), ["P2"]);

// Legacy hours: allowed and tagged.
const legacyOnly = planItinerary({
  ...base,
  candidates: [candidate("place:L1", 14.561, 121.081, 1, 30, "Tuesday to Sunday, 9:00 AM – 4:00 PM")],
});
assert.equal(legacyOnly.stops[0].tag, "hours_not_confirmed");

// Too far for the budget (more than half the budget away): left out.
const farAway = planItinerary({ ...base, budgetMinutes: 120, candidates: [candidate("place:F1", 14.6, 121.12, 1, 30, null)] });
assert.deepEqual(farAway.stops, []);

// Zero or negative budget.
assert.deepEqual(planItinerary({ ...base, budgetMinutes: 0, candidates: example }).stops, []);

// ---------------------------------------------------------------------------
// Start point
// ---------------------------------------------------------------------------

assert.equal(checkStart(null, PASIG_BOUNDS).ok, false);
assert.equal(checkStart(null, PASIG_BOUNDS).reason, "no_location");
assert.equal(checkStart({ latitude: Number.NaN, longitude: 121.08 }, PASIG_BOUNDS).reason, "no_location");
assert.equal(checkStart({ latitude: 14.4, longitude: 121.08 }, PASIG_BOUNDS).reason, "outside_pasig"); // Muntinlupa side
assert.equal(checkStart({ latitude: 14.56, longitude: 121.2 }, PASIG_BOUNDS).reason, "outside_pasig");
assert.equal(checkStart(START, PASIG_BOUNDS).ok, true);

// ---------------------------------------------------------------------------
// Tiers, saved items, dwell
// ---------------------------------------------------------------------------

const item = (id, category, rank, saved = false, extra = {}) => ({
  kind: "place",
  id,
  name: id,
  category,
  latitude: 14.561,
  longitude: 121.081,
  hours: null,
  visitDuration: null,
  saved,
  recommendedRank: rank,
  ...extra,
});
const likes = new Set(["Heritage"]);
// Recommender list of 9: ranks 0 to 2 top third, 3 to 5 top two thirds, 6 to 8 the rest.
assert.equal(tierOf(item("a", "Heritage", 0), likes, 9), 1); // interest and top third
assert.equal(tierOf(item("b", "Heritage", 7), likes, 9), 2); // interest only
assert.equal(tierOf(item("c", "Food", 4), likes, 9), 2); // top two thirds only
assert.equal(tierOf(item("d", "Food", 0), likes, 9), 2); // top third without interest
assert.equal(tierOf(item("e", "Food", 8), likes, 9), 3);
assert.equal(tierOf(item("f", "Food", null), likes, 9), 3); // not listed
assert.equal(tierOf(item("g", "Food", null, true), likes, 9), 1); // saved
assert.equal(tierOf(item("h", null, null), new Set(), 0), 3); // guest, nothing selected

assert.equal(resolveDwellMinutes("place", "2 hours"), 120);
assert.equal(resolveDwellMinutes("place", "45 to 60 minutes"), 45); // range: default
assert.equal(resolveDwellMinutes("place", null), 45);
assert.equal(resolveDwellMinutes("business", "2 hours"), 30);

// Saved items join the pool, once, as tier 1, even from outside the query.
const queried = [item("q1", "Food", null), item("q2", "Food", null)];
const savedItems = [item("q2", "Food", null), item("far", "Food", null, false, { latitude: 14.6, longitude: 121.12 })];
const merged = mergePool(queried, savedItems);
assert.equal(merged.length, 3);
assert.equal(merged.filter((m) => m.id === "q2").length, 1);
const built = buildCandidates(merged, [], 0);
assert.equal(built.find((c) => c.id === "q1").tier, 3);
assert.equal(built.find((c) => c.id === "q2").tier, 1);
assert.equal(built.find((c) => c.id === "far").tier, 1);
assert.deepEqual(built.map((c) => c.key), ["place:q1", "place:q2", "place:far"]);

// A saved item that is feasible makes the route over an unsaved one.
const withSaved = planItinerary({
  ...base,
  budgetMinutes: 60,
  candidates: buildCandidates(mergePool([item("q1", "Food", null)], [item("mine", "Food", null)]), [], 0),
});
assert.ok(withSaved.stops.some((s) => s.candidate.id === "mine"));

// Items with no coordinates are dropped from the candidates.
assert.equal(buildCandidates([item("x", "Food", null, false, { latitude: null })], [], 0).length, 0);

// ---------------------------------------------------------------------------
// Refine on road numbers (plan 3.2 step 4), with a stand-in for routing
// ---------------------------------------------------------------------------

const refineInput = { start: START, startTime: NINE_AM, budgetMinutes: 180, mode: "foot", candidates: example };

// Straight-line legs, stop to stop, scaled by `factor`; counts its calls.
function legsFetcher(factor) {
  const fetcher = async (start, stops, mode) => {
    fetcher.calls += 1;
    let from = start;
    return stops.map((stop) => {
      const leg = estimateLeg(from, stop, mode);
      from = stop;
      return { km: leg.km * factor, minutes: leg.minutes * factor };
    });
  };
  fetcher.calls = 0;
  return fetcher;
}

// Routing unavailable (null, or a throw): the straight-line plan comes back, unchecked.
const straight = planItinerary(refineInput);
for (const failing of [async () => null, async () => Promise.reject(new Error("offline"))]) {
  const result = await generateItinerary(refineInput, failing);
  assert.equal(result.roadChecked, false);
  assert.deepEqual(result.itinerary, straight);
}

// Road numbers equal to the estimates: same route, one call, checked.
const sameFetcher = legsFetcher(1);
const same = await generateItinerary(refineInput, sameFetcher);
assert.equal(same.roadChecked, true);
assert.equal(sameFetcher.calls, 1);
assert.deepEqual(same.itinerary.stops.map((s) => s.candidate.id), straight.stops.map((s) => s.candidate.id));
assert.ok(Math.abs(same.itinerary.totalMinutes - straight.totalMinutes) < 0.05);

// Roads three times slower: at most two routing calls, still inside the budget,
// every stop still passes its hours check, and the legs are the road legs.
const slowFetcher = legsFetcher(3);
const slow = await generateItinerary(refineInput, slowFetcher);
assert.equal(slow.roadChecked, true);
assert.ok(slowFetcher.calls >= 1 && slowFetcher.calls <= 2, `calls ${slowFetcher.calls}`);
assert.ok(slow.itinerary.totalMinutes <= 180 + 1e-6, `total ${slow.itinerary.totalMinutes}`);
assert.ok(slow.itinerary.stops.length <= MAX_STOPS);

// A stop the road makes unreachable in time is dropped, then the plan reruns without it.
const onlyOne = [candidate("place:P1", 14.564, 121.083, 1, 45, weekly(["09:00", "17:00"]))];
let oneCalls = 0;
const unreachable = await generateItinerary({ ...refineInput, candidates: onlyOne }, async () => {
  oneCalls += 1;
  return [{ km: 40, minutes: 600 }]; // arrives at 19:00, after it closes
});
assert.equal(oneCalls, 1);
assert.equal(unreachable.itinerary.stops.length, 0);

// No candidates: no routing call at all.
let emptyCalls = 0;
const none = await generateItinerary({ ...refineInput, candidates: [] }, async () => {
  emptyCalls += 1;
  return [];
});
assert.equal(emptyCalls, 0);
assert.equal(none.itinerary.stops.length, 0);

console.log("itinerary: ok");
