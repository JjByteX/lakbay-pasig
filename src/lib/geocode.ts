import type { Coordinates } from "@/lib/discover-query";
// Relative, not "@/", so `npx tsx src/lib/geocode.ts` can resolve it. The
// root tsconfig has no `paths`. Type imports above are erased, this one isn't.
import { PASIG_BOUNDS } from "./map-style";

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

// minLon,minLat,maxLon,maxLat. Covers all 8 seeded points. Same values as
// before, now one copy in map-style.ts (map-bounds-plan.md), so the search
// box and the map's locked box can't drift apart.
const PASIG_BBOX = PASIG_BOUNDS.join(",");
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
  // True when the hit is an address point whose house number matches the one
  // typed (see searchPlaces). Lets the search bar say when nothing matched.
  exactHouse?: boolean;
}

// "93-b e. mendoza st." -> { number: "93", suffix: "b", street: "e. mendoza st." }.
// A suffix counts only when it is attached (93-b, 93b), so "93 E Mendoza"
// keeps its E as part of the street. null when the text has no leading house
// number and a street after it.
export interface HouseNumberQuery {
  number: string;
  suffix: string | null;
  street: string;
}

export function parseHouseNumber(text: string): HouseNumberQuery | null {
  const match = /^\s*(\d+)(?:\s*-\s*([A-Za-z0-9]+)|([A-Za-z]))?\s+(\S.*?)\s*$/.exec(text);
  if (!match) return null;
  const [, number, hyphenSuffix, letterSuffix, street] = match;
  return { number, suffix: hyphenSuffix ?? letterSuffix ?? null, street };
}

// Dots out, spaces collapsed, a trailing "st"/"ave"/... spelled out, the way
// OpenStreetMap writes them: "e. mendoza st." -> "e mendoza street".
export function normalizeStreet(street: string): string {
  const words = street.toLowerCase().replace(/\./g, " ").split(/\s+/).filter(Boolean);
  const last = words.length - 1;
  const full: Record<string, string> = { st: "street", ave: "avenue", blvd: "boulevard", rd: "road", dr: "drive" };
  if (last > 0 && full[words[last]]) words[last] = full[words[last]];
  return words.join(" ");
}

// Letters and digits only, for comparing house numbers and street names.
const compact = (value: string | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

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
//
// A text that starts with a house number ("93-b e. mendoza st.") is also asked
// the way OpenStreetMap writes it ("93b e mendoza street", "93 e mendoza
// street"): the typed form rarely matches an address point. Hits whose house
// number and street match the typed ones go first, marked exactHouse. If
// OpenStreetMap has no point for that number, the street hits are returned as
// before and the caller can say so.
// A hit plus the two Photon fields the house-number match reads.
type PhotonHit = PlaceResult & { housenumber?: string; street?: string };

async function searchPhoton(q: string): Promise<PhotonHit[]> {
  const data = await getJson(
    `${PHOTON_BASE_URL}/api/?q=${encodeURIComponent(q)}&limit=${RESULT_LIMIT}&bbox=${PASIG_BBOX}`,
  );
  const results: PhotonHit[] = [];
  for (const feature of data.features ?? []) {
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    const props = feature.properties ?? {};
    const name = props.name?.trim() || null;
    results.push({
      name,
      address: formatAddress(props) || name || "",
      location: { latitude, longitude },
      housenumber: props.housenumber,
      street: props.street,
    });
  }
  return results;
}

const toPlaceResult = ({ name, address, location }: PhotonHit): PlaceResult => ({ name, address, location });

export async function searchPlaces(text: string): Promise<PlaceResult[]> {
  const q = text.trim();
  if (!q) return [];

  const parsed = parseHouseNumber(q);
  if (!parsed) return (await searchPhoton(q)).map(toPlaceResult);

  const street = normalizeStreet(parsed.street);
  const withSuffix = parsed.suffix ? `${parsed.number}${parsed.suffix}` : parsed.number;
  const variants = [...new Set([`${withSuffix} ${street}`, `${parsed.number} ${street}`])];
  // The typed text must succeed (its errors surface); the rewrites are extra.
  const [typed, ...rewritten] = await Promise.all([
    searchPhoton(q),
    ...variants.map((v) => searchPhoton(v).catch(() => [] as PhotonHit[])),
  ]);

  const wantedStreet = compact(street);
  const wantedFull = compact(withSuffix);
  const wantedNumber = compact(parsed.number);
  // 2: same house number and suffix, 1: same number, 0: not this address.
  const rank = (hit: PhotonHit): number => {
    const hitStreet = compact(hit.street);
    if (!hit.housenumber || !hitStreet) return 0;
    if (!hitStreet.includes(wantedStreet) && !wantedStreet.includes(hitStreet)) return 0;
    const number = compact(hit.housenumber);
    if (number === wantedFull) return 2;
    return number === wantedNumber ? 1 : 0;
  };

  const seen = new Set<string>();
  const merged: PhotonHit[] = [];
  for (const hit of [...rewritten.flat(), ...typed]) {
    const key = `${hit.location.latitude.toFixed(5)},${hit.location.longitude.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }
  merged.sort((x, y) => rank(y) - rank(x));
  return merged.slice(0, RESULT_LIMIT).map((hit) => {
    const result = toPlaceResult(hit);
    return rank(hit) > 0 ? { ...result, exactHouse: true } : result;
  });
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

  const parsedFull = parseHouseNumber("93-b e. mendoza st.");
  assertEqual(parsedFull?.number, "93", "parse: number");
  assertEqual(parsedFull?.suffix, "b", "parse: hyphen suffix");
  assertEqual(parsedFull?.street, "e. mendoza st.", "parse: street");
  assertEqual(parseHouseNumber("93 E Mendoza")?.suffix, null, "parse: spaced E stays in the street");
  assertEqual(parseHouseNumber("93 E Mendoza")?.street, "E Mendoza", "parse: spaced E street");
  assertEqual(parseHouseNumber("93b e mendoza")?.suffix, "b", "parse: attached letter suffix");
  assertEqual(parseHouseNumber("mendoza"), null, "parse: no number");
  assertEqual(parseHouseNumber("93"), null, "parse: number only");
  assertEqual(normalizeStreet("e. mendoza st."), "e mendoza street", "normalize: dots and st");
  assertEqual(normalizeStreet("st. joseph"), "st joseph", "normalize: leading st kept");

  console.log("geocode.ts demo: all checks passed");
}

// Same Node-only guard as page-title.ts: `process` doesn't exist in the
// Vite browser bundle, and this must never fire on import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
