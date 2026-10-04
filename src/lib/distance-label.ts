import { distanceKm, type Coordinates } from "./discover-query";
import { formatDistance } from "./directions";

/**
 * One place for the distance text shown on cards, rows and detail pages, so
 * every surface reads the same ("350 m away", "2.4 km away").
 *
 * Reuses formatDistance (directions.ts), the formatter the Directions panel
 * already uses ("12 min · 2.4 km"): meters below 1 km, km with one decimal at
 * 1 km and over. No second formatter. Reuses distanceKm (discover-query.ts) for
 * the straight-line figure, the same one the Discover list sorts by. It is a
 * straight line, not a walking distance, which is why the Directions panel
 * still shows its own road figure once a route exists.
 *
 * Two phrasings, because the number means two different things:
 *   "... away"       measured from the person (live location)
 *   "... from here"  measured from the page item (the Similar row, migration
 *                    0048). Plain "350 m" there would read as distance from
 *                    the viewer, and it is not.
 *
 * Kept free of any component or context import on purpose: result-card.tsx
 * uses this, and the shell imports it through global-search-bar.tsx, so
 * reading the shell from here would be an import cycle. Callers pass the
 * location in.
 */

export function formatKm(km: number): string {
  return formatDistance(km * 1000);
}

/** "350 m away", for a distance already measured from the person. */
export function kmAway(km: number | null | undefined): string | null {
  if (km == null) return null;
  return `${formatKm(km)} away`;
}

/**
 * "350 m away" from a location to a pin, or null when either side is missing
 * (no location fix, or a record with no pin). Null means show nothing: there
 * is no placeholder for a missing distance.
 */
export function distanceAway(
  from: Coordinates | null | undefined,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): string | null {
  if (!from || latitude == null || longitude == null) return null;
  return kmAway(distanceKm(from, { latitude, longitude }));
}

/** "350 m from here", for a distance already measured from the page item. */
export function distanceFromHere(km: number | null | undefined): string | null {
  if (km == null) return null;
  return `${formatKm(km)} from here`;
}

/** Joins the parts of a muted meta line with the middle dot the Directions panel uses. */
export function joinMeta(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}
