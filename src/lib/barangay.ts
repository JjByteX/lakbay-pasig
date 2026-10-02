// Reports Phase 4 (reports-phases.md): which barangay a pin falls in, and
// per-barangay counts for the heatmap. Barangay is computed on read from
// latitude and longitude, never stored (reports-plan.md, decision #21: the
// pin is the source of truth). No dependency, plain ray casting.

type Position = number[]; // [longitude, latitude], GeoJSON order
type Ring = Position[];

export interface BarangayFeature {
  type: "Feature";
  properties: { name: string };
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
}

// One row of report_points() (migration 0043). Coordinates can be null:
// the "no pin" note needs those rows, so they are returned, not filtered.
export interface ReportPoint {
  kind: "place" | "business";
  id: string;
  latitude: number | null;
  longitude: number | null;
  verification_status: "pending" | "verified";
}

export interface StatusCounts {
  verified: number;
  pending: number;
}

export interface BarangayCount {
  name: string;
  place: StatusCounts;
  business: StatusCounts;
}

export interface BarangayCountResult {
  // One entry per feature, in feature order, zeros included.
  barangays: BarangayCount[];
  noPin: ReportPoint[];
  noMatch: ReportPoint[];
}

// Standard even-odd ray cast against one ring. The half-open edge test
// ((yi > lat) !== (yj > lat)) means a point exactly on an edge shared by two
// polygons is inside at most one of them in the usual case.
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Polygon = outer ring (index 0) minus holes (the rest).
function inPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (rings.length === 0 || !inRing(lng, lat, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (inRing(lng, lat, rings[h])) return false;
  }
  return true;
}

function inFeature(lng: number, lat: number, feature: BarangayFeature): boolean {
  const g = feature.geometry;
  if (g.type === "Polygon") return inPolygon(lng, lat, g.coordinates);
  return g.coordinates.some((poly) => inPolygon(lng, lat, poly));
}

// Index of the first feature containing the point, or -1. First match wins,
// so a point on a shared edge is counted once.
function indexOfBarangay(lat: number, lng: number, features: BarangayFeature[]): number {
  return features.findIndex((f) => inFeature(lng, lat, f));
}

// Name of the barangay containing the point, or null when it is outside all.
export function barangayOf(lat: number, lng: number, features: BarangayFeature[]): string | null {
  const i = indexOfBarangay(lat, lng, features);
  return i === -1 ? null : features[i].properties.name;
}

export function countByBarangay(points: ReportPoint[], features: BarangayFeature[]): BarangayCountResult {
  const barangays: BarangayCount[] = features.map((f) => ({
    name: f.properties.name,
    place: { verified: 0, pending: 0 },
    business: { verified: 0, pending: 0 },
  }));
  const noPin: ReportPoint[] = [];
  const noMatch: ReportPoint[] = [];

  for (const p of points) {
    if (p.latitude === null || p.longitude === null) {
      noPin.push(p);
      continue;
    }
    const i = indexOfBarangay(p.latitude, p.longitude, features);
    if (i === -1) {
      noMatch.push(p);
      continue;
    }
    barangays[i][p.kind][p.verification_status] += 1;
  }

  return { barangays, noPin, noMatch };
}

// Ponytail's non-trivial-logic rule: the point-in-polygon and counting logic
// gets the smallest runnable check, plain asserts, no framework. Same
// pattern as map-style.ts. Run with: npx tsx src/lib/barangay.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  const square = (x0: number, y0: number, x1: number, y1: number): Ring => [
    [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0],
  ];

  const features: BarangayFeature[] = [
    // Donut: 0..4 square with a 1..3 hole.
    { type: "Feature", properties: { name: "Donut" }, geometry: { type: "Polygon", coordinates: [square(0, 0, 4, 4), square(1, 1, 3, 3)] } },
    // Two separate parts. The first shares its x=4 edge with Donut.
    {
      type: "Feature",
      properties: { name: "Split" },
      geometry: { type: "MultiPolygon", coordinates: [[square(4, 0, 6, 2)], [square(10, 10, 12, 12)]] },
    },
  ];

  // Inside, outside, inside a hole.
  assertEqual(barangayOf(0.5, 0.5, features), "Donut", "inside the ring");
  assertEqual(barangayOf(2, 2, features), null, "inside the hole");
  assertEqual(barangayOf(8, 8, features), null, "outside every barangay");
  // MultiPolygon: both parts match.
  assertEqual(barangayOf(1, 5, features), "Split", "MultiPolygon, first part");
  assertEqual(barangayOf(11, 11, features), "Split", "MultiPolygon, second part");

  // Null coordinates, a point on the shared edge, and ordinary rows.
  const pt = (id: string, kind: ReportPoint["kind"], status: ReportPoint["verification_status"], lat: number | null, lng: number | null): ReportPoint => ({
    kind, id, latitude: lat, longitude: lng, verification_status: status,
  });
  const result = countByBarangay(
    [
      pt("a", "place", "verified", 0.5, 0.5),
      pt("b", "business", "pending", 11, 11),
      pt("c", "place", "pending", null, null),
      pt("d", "business", "verified", 8, 8),
      pt("e", "place", "verified", 1, 4), // on the shared edge x=4
    ],
    features,
  );
  assertEqual(result.noPin.length, 1, "null coordinates go to noPin");
  assertEqual(result.noMatch.length, 1, "outside point goes to noMatch");
  assertEqual(result.barangays[0].place.verified, 1, "Donut place verified (hole and edge excluded)");
  assertEqual(result.barangays[1].business.pending, 1, "Split business pending");
  const edgeTotal = result.barangays[0].place.verified + result.barangays[1].place.verified;
  assertEqual(edgeTotal, 2, "border point counted once (a plus e, not a plus e twice)");
  const counted = result.barangays.reduce(
    (n, b) => n + b.place.verified + b.place.pending + b.business.verified + b.business.pending,
    0,
  );
  assertEqual(counted + result.noPin.length + result.noMatch.length, 5, "every row lands in exactly one bucket");

  console.log("barangay.ts demo: all checks passed");
}

// Same Node-only guard as map-style.ts: `process` doesn't exist in the Vite
// browser bundle, and this must never fire on import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
