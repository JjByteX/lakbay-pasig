import type { TrailDiscoveryContent } from "./trail-types";

// Meters. The radius a stop unlocks at when none of its entries set a
// larger one, and when it has no entries at all (docs/discovery-content-
// plan.md). Phone GPS is often off by 10 to 20 m, so a default much under
// 25 would often fail to unlock. The admin entry form prefills the same
// number, so staff never type it.
export const DEFAULT_UNLOCK_RADIUS = 25;

// A stop unlocks as one unit at the place pin, at the largest radius among
// its entries, or the default when it has none.
export function stopUnlockRadius(entries: TrailDiscoveryContent[]): number {
  const largest = entries.reduce((max, entry) => Math.max(max, entry.unlock_radius), 0);
  return largest > 0 ? largest : DEFAULT_UNLOCK_RADIUS;
}
