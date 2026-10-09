import { supabase } from "./supabase";
import { distanceKm, type Coordinates } from "./discover-query";
import { fetchEntryByToken, unlockEntry } from "./entry-unlocks";
import { getRouteProgress } from "./trail-progress";
import { fetchTrailDetail } from "./trail-query";
import type { TrailStop } from "./trail-types";
import { DEFAULT_UNLOCK_RADIUS } from "./trail-unlock";

/**
 * What happened when a visitor scanned an object's QR code. GPS opens the
 * stop at the place, the code proves the visitor is at the object, so a scan
 * only counts when the visitor is on a trail whose stop for this place is
 * already unlocked AND is inside that stop's radius right now (a saved photo
 * of the code does not work from home). docs/discovery-content-plan.md.
 *
 * `unlocked` carries what the confirmation and the trail page need: the stop's
 * name for the scan page's "Stop unlocked", and the entry id so the trail page
 * can reveal exactly that entry. `too-far` carries how far the visitor is from
 * the nearest eligible stop and that stop's radius, so the message can say how
 * much closer to move instead of only "too far".
 */
export type ScanResult =
  | { status: "unlocked"; routeId: string; stopName: string; entryId: string }
  | { status: "not-found" }
  | { status: "no-trail"; trails: { id: string; name: string }[] }
  | { status: "no-location" }
  | { status: "too-far"; meters: number; radius: number };

/**
 * What the scan page hands the trail page through router state when a scan
 * unlocks an entry, so the trail page can reveal that entry once. Router state,
 * not a URL param: it is a one-time moment, not an address, and the trail page
 * clears it after reading it so a reload never replays it.
 */
export interface ScanArrival {
  entryId: string;
}

export function scanArrivalState(arrival: ScanArrival): { scanArrival: ScanArrival } {
  return { scanArrival: arrival };
}

export function readScanArrival(state: unknown): ScanArrival | null {
  if (typeof state !== "object" || state === null) return null;
  const arrival = (state as { scanArrival?: unknown }).scanArrival;
  if (typeof arrival !== "object" || arrival === null) return null;
  const entryId = (arrival as { entryId?: unknown }).entryId;
  return typeof entryId === "string" ? { entryId } : null;
}

// Straight-line meters from the visitor to a stop, or null when the stop has no
// coordinate to measure against (same case trail-detail.tsx skips).
function metersToStop(position: Coordinates, stop: TrailStop): number | null {
  if (stop.latitude == null || stop.longitude == null) return null;
  return distanceKm(position, { latitude: stop.latitude, longitude: stop.longitude }) * 1000;
}

export async function scanEntry(
  token: string,
  userId: string,
  position: Coordinates | null
): Promise<ScanResult> {
  const entry = await fetchEntryByToken(token);
  if (!entry) return { status: "not-found" };

  // Every trail the visitor can see with a stop at this place or business:
  // published trails (0005), plus the visitor's own personal trails (0054,
  // route_stops_own_personal). Nobody else's draft shows, so no filter is
  // needed here. A personal trail then goes through the same unlock and
  // radius checks below as an official one.
  const { data: stopRows, error } = await supabase
    .from("route_stops")
    .select("route_id")
    .eq("stop_type", entry.related_location_type)
    .eq("stop_id", entry.related_location_id);

  if (error) throw error;
  const routeIds = [...new Set((stopRows ?? []).map((r) => r.route_id))];
  if (routeIds.length === 0) return { status: "not-found" };

  const candidates = await Promise.all(
    routeIds.map(async (routeId) => {
      const [detail, progress] = await Promise.all([fetchTrailDetail(routeId), getRouteProgress(userId, routeId)]);
      if (!detail) return null;
      const highestIndex = progress
        ? detail.stops.findIndex((s) => s.id === progress.highestUnlockedStopId)
        : -1;
      const unlockedStop = detail.stops.find(
        (s, index) =>
          s.stop_type === entry.related_location_type &&
          s.stop_id === entry.related_location_id &&
          index <= highestIndex
      );
      return { id: detail.id, name: detail.name, unlockedStop };
    })
  );

  const trails = candidates.filter((c): c is NonNullable<typeof c> => c !== null);
  // Trails where this stop is already unlocked for the visitor, each paired
  // with that stop.
  const onTrail = trails.flatMap((t) => (t.unlockedStop ? [{ id: t.id, stop: t.unlockedStop }] : []));
  if (onTrail.length === 0) {
    return { status: "no-trail", trails: trails.map((t) => ({ id: t.id, name: t.name })) };
  }

  if (!position) return { status: "no-location" };

  // A stop with no coordinate can't be distance-checked (same case
  // trail-detail.tsx skips). The stop is already unlocked, so let the scan
  // through rather than block it forever. When no trail is in range, remember
  // the nearest one so the message can say how far away the visitor is.
  let near: (typeof onTrail)[number] | null = null;
  let closest: { meters: number; radius: number } | null = null;
  for (const candidate of onTrail) {
    const meters = metersToStop(position, candidate.stop);
    if (meters === null || meters <= candidate.stop.unlockRadius) {
      near = candidate;
      break;
    }
    if (!closest || meters < closest.meters) closest = { meters, radius: candidate.stop.unlockRadius };
  }
  if (!near) {
    return {
      status: "too-far",
      meters: closest?.meters ?? 0,
      radius: closest?.radius ?? DEFAULT_UNLOCK_RADIUS,
    };
  }

  await unlockEntry(userId, entry.id);
  return { status: "unlocked", routeId: near.id, stopName: near.stop.name, entryId: entry.id };
}
