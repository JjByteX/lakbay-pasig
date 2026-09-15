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

export interface RouteGeometry {
  type: "LineString";
  coordinates: [number, number][]; // [longitude, latitude] pairs, GeoJSON order
  // Phase 1.3: seconds, read straight from OSRM's own route.duration. Powers
  // the panel's estimated-time row (Phase 5), not used before that phase
  // wires it up, but fetched now since a second field on an existing
  // interface is one line here versus a second round-trip later.
  duration: number;
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
export async function fetchRoute(
  origin: Coordinates,
  destination: Coordinates,
  mode: TravelMode,
): Promise<RouteGeometry> {
  const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `${OSRM_BASE_URL}/routed-${mode}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

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

  return {
    ...data.routes[0].geometry,
    duration: data.routes[0].duration,
  } as RouteGeometry;
}
