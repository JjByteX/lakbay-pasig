import type { Coordinates } from "@/lib/discover-query";

// locate-me-and-directions-phases.md Phase 2: one function wrapping OSRM's
// public demo route endpoint, isolated per the plan's own Files Touched
// table so a future swap to self-hosted OSRM or a paid provider is a
// one-line change here, not a rewrite across result-card.tsx/discover-
// map.tsx. Walking profile only, matching this app's foot-based heritage-
// walk model, not a driving app -- see locate-me-and-directions-plan.md's
// Part 2.
//
// ponytail: OSRM_BASE_URL points at router.project-osrm.org, a shared
// public demo server (1 req/sec, best-effort uptime, no SLA). That ceiling
// is accepted for a capstone-scale app, not silently assumed to hold at
// real scale. Upgrade path: point this one constant at a self-hosted OSRM
// instance or a paid routing provider once usage or uptime needs outgrow
// the demo server -- every caller goes through fetchWalkingRoute, so
// nothing else changes.
const OSRM_BASE_URL = "https://router.project-osrm.org";
const OSRM_PROFILE = "foot";

// Identifies the app to OSRM's demo server, which blocks requests with a
// faked or missing User-Agent (locate-me-and-directions-plan.md's Part 2
// note). Pulled from package.json's real name/version, not a placeholder.
const USER_AGENT = "lakbay-pasig/0.0.1";

export interface RouteGeometry {
  type: "LineString";
  coordinates: [number, number][]; // [longitude, latitude] pairs, GeoJSON order
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

// Fetches a walking route between two points from OSRM's route service.
// Throws DirectionsError with a specific reason on any known failure path;
// callers branch on `.reason` rather than parsing the message string.
export async function fetchWalkingRoute(
  origin: Coordinates,
  destination: Coordinates,
): Promise<RouteGeometry> {
  const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `${OSRM_BASE_URL}/route/v1/${OSRM_PROFILE}/${coords}?overview=full&geometries=geojson`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
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
    throw new DirectionsError("no-route", "No walking route found to this location.");
  }

  return data.routes[0].geometry as RouteGeometry;
}
