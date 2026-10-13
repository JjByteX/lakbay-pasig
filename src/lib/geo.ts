// Straight-line distance, split out of discover-query.ts so code that must
// run in plain Node (scripts/itinerary-check.mjs) can use it. discover-query.ts
// imports supabase.ts, which throws without the Supabase env vars. It still
// re-exports distanceKm, so every existing importer keeps working unchanged.

export interface LatLng {
  latitude: number;
  longitude: number;
}

// Phase 3.3: straight-line (haversine) distance in kilometers. This is a
// sort order for a list, not turn-by-turn routing, per step-5-phases.md, so
// great-circle distance is sufficient, no routing API needed.
//
// Exported as of Step 7, Phase 4.5: trail-detail.tsx's proximity unlock
// check reuses this exact function rather than reimplementing haversine a
// second time, per step-7-phases.md's own 4.5 instruction (same distanceKm
// logic already in discover-query.ts, reused not reinvented) and
// constraints.md's Inventory Before Suggesting rule.
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// [west, south, east, north], the same order as PASIG_BOUNDS in map-style.ts.
export type BoundingBox = readonly [west: number, south: number, east: number, north: number];

/**
 * A box around `center` that contains every point within `radiusKm`
 * (great-circle). Used to bound the itinerary generator's pool query: a
 * latitude and longitude range the database can filter on. Longitude degrees
 * shrink away from the equator, so that side is widened by 1 / cos(latitude).
 */
export function boundsAround(center: LatLng, radiusKm: number): BoundingBox {
  const dLat = (radiusKm / 6371) * (180 / Math.PI);
  const cos = Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01);
  const dLon = dLat / cos;
  return [center.longitude - dLon, center.latitude - dLat, center.longitude + dLon, center.latitude + dLat];
}
