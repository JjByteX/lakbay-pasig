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

// Off-route detection phase 1: the minimum great-circle distance (km) from
// `point` to any segment of `line`, a polyline given as [longitude,
// latitude] pairs in GeoJSON order -- the same shape RouteGeometry.
// coordinates already uses (directions.ts), so a route's own geometry can
// be passed here with no conversion.
//
// Projects each segment onto a local flat-plane approximation (equirect-
// angular: longitude scaled by cos(latitude) to correct for meridians
// converging toward the poles) rather than true great-circle segment
// math, which is the same tier of simplification distanceKm's own
// haversine formula already accepts for this codebase's distances (a
// city's worth of road, not a transcontinental one) -- correct to a few
// meters at Pasig's latitude and scale, not perfectly spherical. Returns
// the distance from the point to the nearest point *on* the nearest
// segment (clamped to that segment's own endpoints), not just to the
// nearest vertex, so a long straight stretch between two sparse polyline
// points doesn't under-detect someone who has drifted sideways off it
// mid-segment.
export function distanceToPolylineKm(
  point: LatLng,
  line: readonly (readonly [number, number])[],
): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) {
    return distanceKm(point, { longitude: line[0][0], latitude: line[0][1] });
  }

  // Local scale: 1 degree of latitude is ~111.32 km everywhere; 1 degree
  // of longitude shrinks by cos(latitude) moving away from the equator.
  // Using the point's own latitude as the reference for this local patch,
  // same approach boundsAround above already takes for the same reason.
  const kmPerDegLat = 111.32;
  const kmPerDegLon = kmPerDegLat * Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.01);

  const toLocalKm = (lon: number, lat: number) => ({
    x: (lon - point.longitude) * kmPerDegLon,
    y: (lat - point.latitude) * kmPerDegLat,
  });

  const p = toLocalKm(point.longitude, point.latitude); // always {x:0, y:0}, kept explicit for clarity over the formula below

  let minDistanceKm = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = toLocalKm(line[i][0], line[i][1]);
    const b = toLocalKm(line[i + 1][0], line[i + 1][1]);
    const segmentDx = b.x - a.x;
    const segmentDy = b.y - a.y;
    const segmentLengthSquared = segmentDx * segmentDx + segmentDy * segmentDy;

    // Degenerate segment (two identical consecutive points, which OSRM's
    // own geometry can produce at a sharp maneuver): falls back to the
    // distance to that single point rather than dividing by zero below.
    let t = 0;
    if (segmentLengthSquared > 0) {
      t = ((p.x - a.x) * segmentDx + (p.y - a.y) * segmentDy) / segmentLengthSquared;
      t = Math.max(0, Math.min(1, t)); // clamp onto the segment, not its infinite extension
    }

    const closestX = a.x + t * segmentDx;
    const closestY = a.y + t * segmentDy;
    const dx = p.x - closestX;
    const dy = p.y - closestY;
    const segmentDistanceKm = Math.sqrt(dx * dx + dy * dy);
    if (segmentDistanceKm < minDistanceKm) minDistanceKm = segmentDistanceKm;
  }
  return minDistanceKm;
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
