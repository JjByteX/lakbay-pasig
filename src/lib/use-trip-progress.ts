import { useMemo } from "react";
import { bearingDegrees, distanceKm, snapToPolyline } from "@/lib/geo";
import type { Coordinates } from "@/lib/discover-query";
import type { RouteGeometry, TravelMode } from "@/lib/directions";

// Navigation phase 1: where the person is on the route they are following.
// No UI and no state of its own: a pure derivation from the shell's live
// position and the selected route, so every consumer (banner, bottom bar,
// follow camera, snapped dot, voice guidance) reads one answer.

// Within this distance (meters) of the route line, the position is snapped
// onto the line. Further away it is left raw, so the dot never hides that the
// person has left the route (off-route detection reads the raw position).
// The distance is the larger of the floor below and the fix's own accuracy,
// so a noisy fix still snaps, capped under the 80 m off-route threshold.
const SNAP_FLOOR_METERS = 30;
const SNAP_CAP_METERS = 70;

function snapDistanceMeters(accuracy: number | null | undefined): number {
  const wanted = typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : 0;
  return Math.min(SNAP_CAP_METERS, Math.max(SNAP_FLOOR_METERS, wanted));
}

// Within this distance (meters) of the destination, the trip counts as
// arrived. Per mode: a car stops further from the door than a walker.
export const ARRIVAL_DISTANCE_METERS: Record<TravelMode, number> = {
  car: 50,
  bike: 20,
  foot: 15,
};

// A step stays "next" until the person is this far (km) past its maneuver
// point, so the banner does not flip the instant the turn is reached.
const STEP_PASSED_KM = 0.005;

// Looking ahead for the bearing skips vertices closer than this (km) to the
// snapped point, so a vertex the person is standing on does not give a
// meaningless direction.
const BEARING_LOOKAHEAD_KM = 0.005;

export interface TripProgress {
  // The position to draw and follow: on the route line when the person is
  // within SNAP_DISTANCE_METERS of it, otherwise the raw position.
  snappedPosition: Coordinates;
  isSnapped: boolean;
  // Route distance and duration left, the route's own totals scaled by the
  // fraction of the line still ahead.
  distanceRemainingMeters: number;
  timeRemainingSeconds: number;
  // Index into route.legs[0].steps of the next maneuver, null when the route
  // has no steps.
  nextStepIndex: number | null;
  distanceToNextStepMeters: number | null;
  // Compass bearing of the route just ahead of the person, degrees clockwise
  // from north.
  bearingAheadDegrees: number;
  arrived: boolean;
}

/**
 * Trip progress for `position` on `route`. Null when there is no route, no
 * position, or the route line is too short to measure against.
 */
export function useTripProgress(
  route: RouteGeometry | null,
  position: Coordinates | null,
  mode: TravelMode,
): TripProgress | null {
  const coordinates = route?.coordinates;
  const steps = route?.legs?.[0]?.steps;

  // Where along the line each step's maneuver sits. Depends only on the
  // route, so it is worked out once per route, not once per GPS fix.
  const stepAlongKm = useMemo(() => {
    if (!coordinates || coordinates.length < 2 || !steps) return null;
    let furthest = 0;
    return steps.map((step) => {
      const snap = snapToPolyline(step.location, coordinates);
      // Never let a step sit before the one ahead of it, which a route that
      // doubles back near itself could otherwise cause.
      furthest = Math.max(furthest, snap?.alongKm ?? furthest);
      return furthest;
    });
  }, [coordinates, steps]);

  return useMemo(() => {
    if (!route || !coordinates || !position) return null;
    const snap = snapToPolyline(position, coordinates);
    if (!snap) return null;

    const isSnapped = snap.offsetKm * 1000 <= snapDistanceMeters(position.accuracy);
    const snappedPosition: Coordinates = isSnapped
      ? { ...position, latitude: snap.point.latitude, longitude: snap.point.longitude }
      : position;

    const fractionRemaining = snap.totalKm > 0 ? Math.max(0, 1 - snap.alongKm / snap.totalKm) : 0;
    // The line's length and OSRM's own distance differ slightly, so the
    // step distance is scaled onto the same basis as the route total.
    const metersPerLineKm = snap.totalKm > 0 ? route.distance / snap.totalKm : 1000;

    let nextStepIndex: number | null = null;
    let distanceToNextStepMeters: number | null = null;
    if (stepAlongKm && stepAlongKm.length > 0) {
      const found = stepAlongKm.findIndex(
        (along, index) => index > 0 && along - snap.alongKm > -STEP_PASSED_KM,
      );
      nextStepIndex = found === -1 ? stepAlongKm.length - 1 : found;
      distanceToNextStepMeters = Math.max(0, stepAlongKm[nextStepIndex] - snap.alongKm) * metersPerLineKm;
    }

    // Bearing of the line ahead: from the snapped point to the first vertex
    // after it that is not right on top of it.
    let bearingAheadDegrees = 0;
    for (let i = snap.segmentIndex + 1; i < coordinates.length; i++) {
      const vertex = { longitude: coordinates[i][0], latitude: coordinates[i][1] };
      if (distanceKm(snap.point, vertex) >= BEARING_LOOKAHEAD_KM || i === coordinates.length - 1) {
        bearingAheadDegrees = bearingDegrees(snap.point, vertex);
        break;
      }
    }

    const last = coordinates[coordinates.length - 1];
    const metersToDestination =
      distanceKm(position, { longitude: last[0], latitude: last[1] }) * 1000;

    return {
      snappedPosition,
      isSnapped,
      distanceRemainingMeters: route.distance * fractionRemaining,
      timeRemainingSeconds: route.duration * fractionRemaining,
      nextStepIndex,
      distanceToNextStepMeters,
      bearingAheadDegrees,
      arrived: metersToDestination <= ARRIVAL_DISTANCE_METERS[mode],
    };
  }, [route, coordinates, position, mode, stepAlongKm]);
}
