import { useEffect, useRef } from "react";
import { distanceToPolylineKm } from "@/lib/geo";
import type { Coordinates } from "@/lib/discover-query";
import type { RouteGeometry } from "@/lib/directions";

// Off-route detection phase 1, human-asked ("let's make the navigation
// better"): watches the person's live position against the current
// route's own geometry (RouteGeometry.coordinates, directions.ts) and
// calls `reroute` once they've drifted far enough off it. Every serious
// open-source nav project researched earlier this session (miles,
// firstproject, Roadstr) treats this as standard, not optional, app
// logic -- no third-party routing-side "am I off route" API exists to
// call instead; OSRM only answers "what's the route from A to B", not
// "is this moving point still on a route it already gave out".
//
// Pure app logic, reusing pieces that already exist: `position` is the
// shell's own watchPosition (same convention use-trail-walk.ts and
// use-voice-guidance.ts already follow), `route` is the shell's own
// fetchRoute result, and `reroute` is public-shell.tsx's own `refetch`,
// passed in rather than duplicated -- this hook triggers a reroute, it
// does not know how to fetch one itself.

// How far (meters) from the route line triggers a reroute. Deliberately
// wider than voice guidance's own ANNOUNCE_RADIUS_METERS (60m, how close
// to a turn before announcing it): that number answers "is the person
// near enough to this point to hear about it now", a precision check;
// this number answers "has the person actually left the route", a
// tolerance check that needs to be wide enough that ordinary GPS drift
// (a phone's own position jitter, typically 5-20m even standing still,
// more under tree cover or between tall buildings) and simply walking on
// the correct side of a wide road never fire a reroute by themselves.
// 80m was picked as comfortably wider than typical GPS jitter plus a
// realistic road+sidewalk width, while still catching an actual wrong
// turn (Pasig's blocks, per the screenshots used earlier this session,
// are mostly well under 150m, so a real wrong turn crosses this
// threshold quickly, not after wandering for several blocks).
const OFF_ROUTE_THRESHOLD_METERS = 80;

// How long (ms) the person must stay continuously off-route before a
// reroute fires, rather than reacting to the first position fix that
// crosses the threshold. A single noisy GPS fix can read 80m+ off the
// line for one sample and correct itself on the next; requiring the
// condition to hold across this whole window filters that out without
// needing a second geolocation source to cross-check against. 8 seconds
// was picked as long enough to outlast a one-off bad fix (watchPosition
// typically updates roughly once a second, per public-shell.tsx's own
// ponytail note, so this spans several independent samples) while still
// short enough that a real wrong turn gets caught within a block or two
// of walking, not after several minutes of heading the wrong way.
const OFF_ROUTE_CONFIRM_MS = 8000;

// Minimum time (ms) between one reroute firing and the next being
// allowed to. A successful reroute fetches a brand new route from the
// person's current position, so by definition they start back ON that
// new route -- but the position fix immediately after a reroute can
// still be stale enough (the device's own GPS lag, not this hook's
// fault) to read as still off the old threshold for one more sample.
// Without a cooldown, that single stale sample could immediately refire
// a second reroute before the fresh route has had a chance to be judged
// against a truly current position. Longer than OFF_ROUTE_CONFIRM_MS so
// a cooldown period can never itself accumulate enough continuously-off
// time to trigger the very next reroute it's supposed to be preventing.
const REROUTE_COOLDOWN_MS = 15000;

/**
 * Watches `position` against `route`'s own geometry and calls `reroute()`
 * once the person has been continuously more than OFF_ROUTE_THRESHOLD_METERS
 * from the route line for OFF_ROUTE_CONFIRM_MS, with a cooldown afterward so
 * one reroute's own settling-in period can't immediately trigger another.
 * Call this once, anywhere a route is actively being followed -- it has no
 * UI of its own and returns nothing; `reroute` is the side effect.
 *
 * Does nothing (no timer running, no reroute ever fires) whenever `route`
 * or `position` is null/absent, or `route.coordinates` is too short to
 * measure a line against -- the same "degrade to doing nothing instead of
 * guessing" rule the rest of this codebase's GPS-dependent features
 * already follow (use-trail-walk.ts's proximity unlock, voice guidance's
 * own announce check) for a null or not-yet-available position.
 */
export function useOffRouteReroute(
  route: RouteGeometry | null,
  position: Coordinates | null,
  reroute: () => void,
): void {
  // When continuous off-route time began, or null while currently on-route
  // (or nothing to measure). A ref, not state: this is a timer input, not
  // something any UI reads back out of this hook -- only the effect below
  // needs to see it change.
  const offRouteSinceRef = useRef<number | null>(null);
  // Timestamp of the last reroute this hook actually triggered, or null
  // before the first one. Checked against REROUTE_COOLDOWN_MS before a
  // new one is allowed to fire.
  const lastRerouteAtRef = useRef<number | null>(null);
  // Identity of the `route` last seen, so a route that just changed
  // (including one this very hook just triggered) resets the
  // off-route timer rather than treating "was off the old route" as
  // carrying over onto how far off the brand new one the person is.
  const routeRef = useRef<RouteGeometry | null>(null);

  useEffect(() => {
    if (routeRef.current !== route) {
      routeRef.current = route;
      offRouteSinceRef.current = null;
    }

    if (!route || !position || route.coordinates.length < 2) {
      offRouteSinceRef.current = null;
      return;
    }

    const distanceMeters = distanceToPolylineKm(position, route.coordinates) * 1000;
    const now = Date.now();

    if (distanceMeters <= OFF_ROUTE_THRESHOLD_METERS) {
      offRouteSinceRef.current = null; // back on route: the confirm window resets, not just pauses
      return;
    }

    if (offRouteSinceRef.current === null) {
      offRouteSinceRef.current = now; // first sample over the threshold: start the confirm window
      return;
    }

    const continuouslyOffRouteMs = now - offRouteSinceRef.current;
    if (continuouslyOffRouteMs < OFF_ROUTE_CONFIRM_MS) return; // not confirmed yet

    if (
      lastRerouteAtRef.current !== null &&
      now - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS
    ) {
      return; // confirmed, but still cooling down from the last reroute
    }

    lastRerouteAtRef.current = now;
    offRouteSinceRef.current = null; // the reroute this triggers will replace `route`, resetting via the identity check above on its own next run
    reroute();
  }, [route, position, reroute]);
}
