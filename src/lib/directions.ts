import type { Coordinates } from "@/lib/discover-query";

// locate-me-and-directions-phases.md Phase 2: one function wrapping an
// OSRM route endpoint, isolated per the plan's own Files Touched table so
// a future swap to self-hosted OSRM or a paid provider is a one-line
// change here, not a rewrite across result-card.tsx/discover-map.tsx.
//
// directions-panel-phases.md Phase 1.1/1.2: widened from a walking-only
// fetch to a mode argument, since the directions panel offers Car, Bike,
// and Walk as equal choices, not a foot-only heritage-walk assumption.
//
// Bugfix (Car/Bike/Walk all returned the same route and the same time):
// this previously pointed at router.project-osrm.org and passed `mode`
// as the URL's profile segment. A stock osrm-routed process serves the
// single graph it was prepared with and ignores that segment entirely --
// it does not validate it either, which is why /foot/ and /bike/ were
// accepted and silently answered with car data. One server, one profile.
//
// FOSSGIS runs three separate instances instead, one graph each, selected
// by a path prefix rather than the profile segment: routed-car,
// routed-bike, routed-foot. TravelMode's own values are those three
// suffixes verbatim, so `routed-${mode}` is the whole mapping -- no
// lookup table between the type and the URL. The profile segment after it
// stays "driving" for all three, since each instance still ignores it;
// it's the prefix that picks the graph.
//
// ponytail: the FOSSGIS servers are a free, best-effort public service
// (1 req/sec, no SLA, non-commercial use only) -- same ceiling the old
// demo server had, now with modes that actually differ. Upgrade path is
// unchanged: point OSRM_BASE_URL at a self-hosted instance (one per mode,
// same prefix shape) or a paid provider once usage or uptime outgrows it.
// Every caller goes through fetchRoute, so nothing else changes.
//
// Attribution and the "fix the map" link required by their usage policy
// live in discover-map.tsx's maplibre attributionControl, alongside the
// existing OSM/OpenFreeMap credit, not as a second control.
const OSRM_BASE_URL = "https://routing.openstreetmap.de";

// directions-panel-phases.md Phase 1.1: one mode per icon in the panel's
// top row (Car, Bike, Walk). Values match FOSSGIS's own routed-* path
// prefixes directly, so no separate mapping table between this type and
// the URL built below.
export type TravelMode = "foot" | "bike" | "car";

// Turn-by-turn phase 1: one maneuver, straight from OSRM's own step shape
// (route.legs[n].steps[m]), kept to the fields osrm-instructions.ts needs to
// build a sentence plus the two numbers the panel's step list shows per row.
// Field names and the maneuver/modifier vocabulary are OSRM's own (the
// "Step" object in their http.md), not invented here, so a future look at
// OSRM's docs maps onto this type without translation.
//
// `type` and `modifier` are left as `string`, not a union of OSRM's known
// values, on purpose: OSRM's own vocabulary has ~16 maneuver types and 8
// modifiers, and a step whose server-reported value isn't one Ferrostar/
// osrm-text-instructions-style code expects should fall back to a generic
// sentence (osrm-instructions.ts's job) rather than fail to typecheck or
// throw at runtime over a value this app doesn't special-case yet.
export interface RouteStep {
  distance: number; // meters, this step only
  duration: number; // seconds, this step only
  name: string; // street name OSRM attributes the step to, "" if unnamed
  type: string; // OSRM maneuver type: "turn", "depart", "arrive", "roundabout", etc.
  modifier?: string; // OSRM maneuver modifier: "left", "right", "straight", "slight left", etc. Absent for e.g. "depart"/"arrive"
  // Voice guidance phase 1: the point this step's maneuver happens, straight
  // from OSRM's own step.maneuver.location ([longitude, latitude], GeoJSON
  // order -- same order RouteGeometry.coordinates already uses elsewhere in
  // this file). Added alongside type/modifier above rather than in the
  // first turn-by-turn pass, since nothing needed a maneuver's *position*
  // until voice guidance had to measure how far the person is from it.
  location: Coordinates;
}

// Itinerary generator (build order step 4): one leg of a multi-stop route, in
// the order the points were given. Meters and seconds, straight from OSRM's
// route.legs, so the generator can re-check feasibility on road numbers.
export interface RouteLeg {
  distance: number;
  duration: number;
  // Turn-by-turn phase 1: one entry per maneuver along this leg, in travel
  // order, straight from OSRM's own route.legs[n].steps (now requested via
  // steps=true below). Optional, like RouteLeg itself already was: absent if
  // the service omits it or a response fails readSteps' own shape check, so
  // an odd response degrades to "no step list" rather than a broken one.
  steps?: RouteStep[];
}

export interface RouteGeometry {
  type: "LineString";
  coordinates: [number, number][]; // [longitude, latitude] pairs, GeoJSON order
  // Phase 1.3: seconds, read straight from OSRM's own route.duration. Powers
  // the panel's estimated-time row.
  duration: number;
  // directions-distance-and-from-phases.md Phase 1.1: meters, read straight
  // from OSRM's own route.distance -- same object, same call, no second
  // round-trip. Road distance for the selected mode, not the straight-line
  // distanceKm used elsewhere (discover-query.ts), so it matches the route
  // actually drawn.
  distance: number;
  // One entry per leg between consecutive points (origin, each `via` point in
  // order, destination), so a two-point route has one. Optional: absent if the
  // service omits it. Existing callers never read it.
  legs?: RouteLeg[];
  // Alternative routes for the same trip, slower or longer than this one and
  // different enough that OSRM kept them. Only on the route fetchRoute
  // returns, never on an entry inside this list. Absent when there are none,
  // and always absent on a `via` route (OSRM gives no alternatives past two
  // points). Picking one swaps it in as the route (public-shell.tsx's
  // handleSelectRoute), so everything that reads one route keeps working.
  alternatives?: RouteGeometry[];
}

// Distinguishable failure shapes so result-card.tsx can render a specific
// message per ux-ui-guidelines.md's State Rules, not one generic catch.
export type DirectionsErrorReason = "network" | "rate-limited" | "no-route";

export class DirectionsError extends Error {
  reason: DirectionsErrorReason;

  constructor(reason: DirectionsErrorReason, message: string) {
    super(message);
    this.name = "DirectionsError";
    this.reason = reason;
  }
}

// Fetches a route between two points from OSRM's route service, for the
// given travel mode. Throws DirectionsError with a specific reason on any
// known failure path; callers branch on `.reason` rather than parsing the
// message string.
//
// Itinerary generator (build order step 4): `via` is an optional list of
// stops between origin and destination, visited in order, in the same single
// request (OSRM takes several waypoints natively). Omitted, it is empty and
// the call is the two-point one every existing caller makes, unchanged.
// duration and distance then cover the whole route, and `legs` splits them
// per leg.
export async function fetchRoute(
  origin: Coordinates,
  destination: Coordinates,
  mode: TravelMode,
  via: Coordinates[] = [],
): Promise<RouteGeometry> {
  const coords = [origin, ...via, destination].map((p) => `${p.longitude},${p.latitude}`).join(";");
  // Turn-by-turn phase 1: steps=true added, human-asked ("let's make the
  // navigation better"). Same request, same server, same 1 req/sec ceiling
  // -- this is a query-string flag OSRM already supports, not a different
  // endpoint or a second round trip. Costs a bigger response body (each
  // step repeats a small geometry + instruction payload) but no extra
  // requests against the FOSSGIS rate limit.
  // alternatives=true: same request and same rate limit, OSRM adds up to one
  // more route to the same response. Left off for a `via` trip, which OSRM
  // does not give alternatives for.
  const alternatives = via.length === 0 ? "&alternatives=true" : "";
  const url = `${OSRM_BASE_URL}/routed-${mode}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true${alternatives}`;

  let response: Response;
  try {
    // No custom headers: User-Agent is a forbidden header name in the
    // Fetch spec, so the browser strips any value set here and sends its
    // own. The old hand-set "lakbay-pasig/0.0.1" never left the tab. The
    // browser's real User-Agent satisfies the usage policy's valid-UA
    // requirement on its own, and adding no headers also keeps this a
    // simple request with no CORS preflight.
    response = await fetch(url);
  } catch {
    throw new DirectionsError("network", "Couldn't reach the routing service, try again.");
  }

  if (response.status === 429) {
    throw new DirectionsError(
      "rate-limited",
      "Too many requests right now, wait a moment and try again.",
    );
  }
  if (!response.ok) {
    throw new DirectionsError("network", "Couldn't reach the routing service, try again.");
  }

  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new DirectionsError("no-route", "No route found to this location.");
  }

  const best = readRoute(data.routes[0]);
  const others: RouteGeometry[] = data.routes.slice(1).map(readRoute);
  return others.length > 0 ? { ...best, alternatives: others } : best;
}

// One entry of OSRM's `routes`, as this app's RouteGeometry. Same fields the
// single route always had, now shared by the best route and each alternative.
function readRoute(raw: {
  geometry: object;
  duration: number;
  distance: number;
  legs: unknown;
}): RouteGeometry {
  return {
    ...raw.geometry,
    duration: raw.duration,
    distance: raw.distance,
    legs: readLegs(raw.legs),
  } as RouteGeometry;
}

/**
 * The road a route spends the most distance on, for the "via" line that tells
 * route options apart (Google Maps' own pattern). Null when the route has no
 * named steps.
 */
export function viaName(route: RouteGeometry): string | null {
  const totals = new Map<string, number>();
  for (const step of route.legs?.[0]?.steps ?? []) {
    if (step.name) totals.set(step.name, (totals.get(step.name) ?? 0) + step.distance);
  }
  let best: string | null = null;
  let bestMeters = 0;
  for (const [name, meters] of totals) {
    if (meters > bestMeters) {
      best = name;
      bestMeters = meters;
    }
  }
  return best;
}

// OSRM's route.legs, kept to the two numbers the app reads, now also the
// per-leg steps list (turn-by-turn phase 1). Undefined when the field is
// missing or malformed, so an odd response never breaks a plain route --
// same shape-check-first, degrade-to-undefined pattern readSteps below
// follows for the same reason one level down.
function readLegs(raw: unknown): RouteLeg[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const legs: RouteLeg[] = [];
  for (const leg of raw) {
    if (typeof leg?.distance !== "number" || typeof leg?.duration !== "number") return undefined;
    legs.push({ distance: leg.distance, duration: leg.duration, steps: readSteps(leg?.steps) });
  }
  return legs;
}

// OSRM's route.legs[n].steps, kept to the fields RouteStep declares.
// Undefined on any malformed entry (missing distance/duration/name, or a
// non-array input), same all-or-nothing rule readLegs uses one level up --
// a step list this app can't fully trust is one it shows none of, rather
// than risk a gap mid-route reading as "route ends here" to someone
// actually following it turn by turn.
function readSteps(raw: unknown): RouteStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const steps: RouteStep[] = [];
  for (const step of raw) {
    const location = step?.maneuver?.location;
    if (
      typeof step?.distance !== "number" ||
      typeof step?.duration !== "number" ||
      typeof step?.name !== "string" ||
      typeof step?.maneuver?.type !== "string" ||
      !Array.isArray(location) ||
      typeof location[0] !== "number" ||
      typeof location[1] !== "number"
    ) {
      return undefined;
    }
    steps.push({
      distance: step.distance,
      duration: step.duration,
      name: step.name,
      type: step.maneuver.type,
      modifier:
        typeof step.maneuver.modifier === "string" ? step.maneuver.modifier : undefined,
      // OSRM's own [longitude, latitude] tuple order, converted to this
      // codebase's {latitude, longitude} Coordinates shape here once, so
      // every reader of RouteStep.location downstream (voice guidance's
      // distance math) uses the same field names as everywhere else
      // instead of remembering OSRM's array order itself.
      location: { latitude: location[1], longitude: location[0] },
    });
  }
  return steps;
}

// directions-distance-and-from-phases.md Phase 1.2: lives here, not in
// directions-panel.tsx, per that phase's own ponytail fallback -- a
// component file that imports lucide-react and other browser-only
// dependencies won't load under plain `tsx` in an environment with no
// node_modules installed (confirmed: `npx tsx directions-panel.tsx` fails
// on the lucide-react import, `npx tsx directions.ts` does not). Keeping
// the formatter with its data source (this file, beside fetchRoute) also
// reads fine on its own.
//
// Round first, then branch, so a value that rounds up into the next unit
// (995 m) never prints in the smaller one -- "1000 m" never appears, only
// "1.0 km". Meters rounded to the nearest 10 below 1000 m ("350 m"); km
// with one decimal at 1000 m and over ("2.4 km").
export function formatDistance(meters: number): string {
  const roundedMeters = Math.round(meters / 10) * 10;
  if (roundedMeters < 1000) return `${roundedMeters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Same Node-only guard and assert-check pattern as geocode.ts's demo().
// Run with: npx tsx src/lib/directions.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };

  assertEqual(formatDistance(0), "0 m", "zero");
  assertEqual(formatDistance(4), "0 m", "rounds down to zero");
  assertEqual(formatDistance(5), "10 m", "rounds up to nearest 10");
  assertEqual(formatDistance(349), "350 m", "rounds up to 350");
  assertEqual(formatDistance(350), "350 m", "exact 350");
  assertEqual(formatDistance(994), "990 m", "rounds down, stays under 1km");
  assertEqual(formatDistance(995), "1.0 km", "rounds up into km, not 1000 m");
  assertEqual(formatDistance(1000), "1.0 km", "exact 1km");
  assertEqual(formatDistance(2449), "2.4 km", "km truncation");
  assertEqual(formatDistance(2450), "2.5 km", "km rounding up");
  assertEqual(formatDistance(12000), "12.0 km", "double-digit km");

  console.log("directions.ts formatDistance demo: all checks passed");
}

// Same Node-only guard as geocode.ts: `process` doesn't exist in the Vite
// browser bundle, and this must never fire on import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
