import type { Coordinates } from "@/lib/discover-query";

// location-field-phases.md Phase 2: address search and reverse lookup for
// the location picker. One provider, one base URL, same shape as
// OSRM_BASE_URL in directions.ts, so a provider swap is a one-line change
// here and nothing else moves.
//
// Provider: Photon's public server (OpenStreetMap data, no key). It is a
// free demo, fair use only, throttled or banned when heavy, no uptime
// promise. Volume here is staff and vendor edits only, and search runs on
// Enter, never as you type.
//
// ponytail: public server, no SLA. Self host Photon, or point
// PHOTON_BASE_URL at another Photon compatible server, if it throttles.
//
// No custom headers, so every call is a simple request with no CORS
// preflight (checked against the public server, location-field-plan.md
// Check results). No `lang` parameter, it was not tested.
const PHOTON_BASE_URL = "https://photon.komoot.io";

// minLon,minLat,maxLon,maxLat. Covers all 8 seeded points.
const PASIG_BBOX = "121.03,14.52,121.13,14.62";
const RESULT_LIMIT = 5;

// Same shape as DirectionsError in directions.ts: callers branch on
// `.reason`, never on the message. An empty result is not an error, search
// returns an empty list and reverse returns null.
export type GeocodeErrorReason = "network" | "rate-limited";

export class GeocodeError extends Error {
  reason: GeocodeErrorReason;

  constructor(reason: GeocodeErrorReason, message: string) {
    super(message);
    this.name = "GeocodeError";
    this.reason = reason;
  }
}

const NETWORK_MESSAGE = "Couldn't reach the address search, try again.";
const RATE_LIMIT_MESSAGE = "Too many searches right now, wait a moment and try again.";

// The Photon properties formatAddress reads. `name` and `district` are
// listed only so a caller can pass a whole feature's properties straight
// in; formatAddress ignores both. `district` is a congressional district
// ("Pasig First District"), not a barangay. The barangay is `locality`.
export interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: PhotonProperties;
}

export interface PlaceResult {
  // The place's own name, when it has one. Two hits on the same street can
  // share an address, so the results list needs this to tell them apart.
  name: string | null;
  // What fills the Address field. Falls back to the name when a hit has no
  // address parts at all.
  address: string;
  location: Coordinates;
}

// One address line: house number and street, then locality (the
// barangay), then city. Every part is optional, since street was missing
// on 3 of 8 checked rows and house number on 7 of 8, so "San Jose, Pasig"
// is a normal result. A house number with no street is dropped, it means
// nothing alone. Returns "" only when every part is missing.
export function formatAddress(p: PhotonProperties): string {
  const clean = (v: string | undefined) => v?.trim() ?? "";
  const street = clean(p.street);
  const streetLine = street ? [clean(p.housenumber), street].filter(Boolean).join(" ") : "";
  return [streetLine, clean(p.locality), clean(p.city)].filter(Boolean).join(", ");
}

async function getJson(url: string): Promise<{ features?: PhotonFeature[] }> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new GeocodeError("network", NETWORK_MESSAGE);
  }
  if (response.status === 429) throw new GeocodeError("rate-limited", RATE_LIMIT_MESSAGE);
  if (!response.ok) throw new GeocodeError("network", NETWORK_MESSAGE);
  try {
    return await response.json();
  } catch {
    throw new GeocodeError("network", NETWORK_MESSAGE);
  }
}

// Top 5 hits inside Pasig for the typed text. Runs only when the caller
// asks (Enter or the search icon). Empty text returns [] with no request.
// Photon returns [lon, lat], GeoJSON order.
export async function searchPlaces(text: string): Promise<PlaceResult[]> {
  const q = text.trim();
  if (!q) return [];

  const data = await getJson(
    `${PHOTON_BASE_URL}/api/?q=${encodeURIComponent(q)}&limit=${RESULT_LIMIT}&bbox=${PASIG_BBOX}`,
  );

  const results: PlaceResult[] = [];
  for (const feature of data.features ?? []) {
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    const props = feature.properties ?? {};
    const name = props.name?.trim() || null;
    results.push({
      name,
      address: formatAddress(props) || name || "",
      location: { latitude, longitude },
    });
  }
  return results;
}

// Address line for a pin. null when nothing usable comes back, which is a
// normal outcome in patchy OSM areas, so the caller leaves the address as
// typed. Only a network or rate limit failure throws.
export async function reverseGeocode(at: Coordinates): Promise<string | null> {
  const data = await getJson(`${PHOTON_BASE_URL}/reverse?lon=${at.longitude}&lat=${at.latitude}`);
  const props = data.features?.[0]?.properties;
  return props ? formatAddress(props) || null : null;
}

// Ponytail's non-trivial-logic rule: formatAddress has real branches, so it
// gets the smallest runnable check, plain asserts, no framework. Same
// pattern as page-title.ts. Run with: npx tsx src/lib/geocode.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) {
      throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };

  assertEqual(
    formatAddress({
      housenumber: "77",
      street: "West Capitol Drive",
      locality: "Kapitolyo",
      city: "Pasig",
      name: "Three Sisters",
      district: "Pasig First District",
    }),
    "77 West Capitol Drive, Kapitolyo, Pasig",
    "full feature",
  );
  assertEqual(
    formatAddress({ street: "A. Mabini Street", locality: "San Jose", city: "Pasig" }),
    "A. Mabini Street, San Jose, Pasig",
    "street, no house number",
  );
  assertEqual(formatAddress({ locality: "San Jose", city: "Pasig" }), "San Jose, Pasig", "locality and city only");
  assertEqual(formatAddress({}), "", "empty feature");
  assertEqual(
    formatAddress({ name: "Pasig City Museum", district: "Pasig First District" }),
    "",
    "name and district are ignored",
  );
  assertEqual(
    formatAddress({ street: "A. Mabini Street", city: "Pasig" }),
    "A. Mabini Street, Pasig",
    "missing part in the middle",
  );
  assertEqual(formatAddress({ street: "  ", city: "Pasig" }), "Pasig", "blank parts skipped");
  assertEqual(formatAddress({ housenumber: "77", locality: "Kapitolyo" }), "Kapitolyo", "house number with no street");

  console.log("geocode.ts demo: all checks passed");
}

// Same Node-only guard as page-title.ts: `process` doesn't exist in the
// Vite browser bundle, and this must never fire on import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
