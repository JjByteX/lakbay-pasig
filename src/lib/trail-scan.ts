import { supabase } from "./supabase";
import { distanceKm, type Coordinates } from "./discover-query";
import { fetchEntryByToken, unlockEntry } from "./entry-unlocks";
import { getRouteProgress } from "./trail-progress";
import { fetchTrailDetail } from "./trail-query";

/**
 * What happened when a visitor scanned an object's QR code. GPS opens the
 * stop at the place, the code proves the visitor is at the object, so a scan
 * only counts when the visitor is on a trail whose stop for this place is
 * already unlocked AND is inside that stop's radius right now (a saved photo
 * of the code does not work from home). docs/discovery-content-plan.md.
 */
export type ScanResult =
  | { status: "unlocked"; routeId: string }
  | { status: "not-found" }
  | { status: "no-trail"; trails: { id: string; name: string }[] }
  | { status: "no-location" }
  | { status: "too-far" };

export async function scanEntry(
  token: string,
  userId: string,
  position: Coordinates | null
): Promise<ScanResult> {
  const entry = await fetchEntryByToken(token);
  if (!entry) return { status: "not-found" };

  // Every published trail with a stop at this place or business. route_stops
  // is public-read for published routes only (0005), so a draft never shows.
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
  const onTrail = trails.filter((t) => t.unlockedStop);
  if (onTrail.length === 0) {
    return { status: "no-trail", trails: trails.map((t) => ({ id: t.id, name: t.name })) };
  }

  if (!position) return { status: "no-location" };

  // A stop with no coordinate can't be distance-checked (same case
  // trail-detail.tsx skips). The stop is already unlocked, so let the scan
  // through rather than block it forever.
  const near = onTrail.find((t) => {
    const stop = t.unlockedStop;
    if (!stop || stop.latitude == null || stop.longitude == null) return true;
    const meters = distanceKm(position, { latitude: stop.latitude, longitude: stop.longitude }) * 1000;
    return meters <= stop.unlockRadius;
  });
  if (!near) return { status: "too-far" };

  await unlockEntry(userId, entry.id);
  return { status: "unlocked", routeId: near.id };
}
