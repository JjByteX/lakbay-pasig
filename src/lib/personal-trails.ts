import { supabase } from "./supabase";
import { distanceKm, type Coordinates } from "./discover-query";
import type { TrailSummary } from "./trail-types";

/**
 * A signed-in user's private trails (routes.personal, migration 0054,
 * docs/user-trails-plan.md). Same tables as an official trail, so the trail
 * page, the unlock logic and the scan all work on them unchanged. This file is
 * only the write side and the list: build, rename, change stops, delete.
 *
 * RLS already pins a personal trail to its owner (routes_own_personal and the
 * restrictive owner-only policies). Every function here still filters on
 * personal = true and created_by = the caller. That is not for security: staff
 * policies on routes and route_stops are "for all", so a staff account calling
 * one of these with an official trail id would otherwise rewrite or delete it.
 */

export const PERSONAL_TRAIL_LIMIT = 10;
export const PERSONAL_STOP_LIMIT = 12;
export const DEFAULT_PERSONAL_TRAIL_NAME = "My trail";
const MAX_NAME_LENGTH = 60;

export type PersonalTrailErrorCode = "trail_limit" | "stop_limit" | "stop_unavailable" | "not_yours";

// Thrown for the failures the person can do something about. Anything else
// (network, a policy refusal) is rethrown as the original error.
export class PersonalTrailError extends Error {
  readonly code: PersonalTrailErrorCode;

  constructor(code: PersonalTrailErrorCode, message: string) {
    super(message);
    this.name = "PersonalTrailError";
    this.code = code;
  }
}

// The two caps are enforced by a trigger (0054), which raises these words.
function rethrow(error: { message: string }): never {
  if (error.message.includes("personal_trail_limit")) {
    throw new PersonalTrailError(
      "trail_limit",
      `You can have up to ${PERSONAL_TRAIL_LIMIT} trails. Delete one to make another.`
    );
  }
  if (error.message.includes("personal_stop_limit")) {
    throw new PersonalTrailError("stop_limit", `A trail can have up to ${PERSONAL_STOP_LIMIT} stops.`);
  }
  throw error;
}

export function cleanTrailName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_PERSONAL_TRAIL_NAME;
}

// ---------------------------------------------------------------------------
// Order: nearest next
// ---------------------------------------------------------------------------

export interface PersonalStop {
  type: "place" | "business";
  id: string;
}

export interface LocatedPersonalStop extends PersonalStop {
  latitude: number | null;
  longitude: number | null;
}

function coordsOf(stop: LocatedPersonalStop): Coordinates | null {
  return stop.latitude == null || stop.longitude == null
    ? null
    : { latitude: stop.latitude, longitude: stop.longitude };
}

/**
 * Orders stops so each one is the nearest to the last (greedy, straight line).
 * The walk starts at `start` when given, else at the first stop in the list, so
 * the person's own first pick stays first. A stop with no coordinate cannot be
 * measured, so it goes last in the order it came. Pure: returns a new array.
 */
export function orderNearestNext<T extends LocatedPersonalStop>(stops: T[], start: Coordinates | null = null): T[] {
  const remaining = stops.filter((s) => coordsOf(s) !== null);
  const unmeasured = stops.filter((s) => coordsOf(s) === null);
  const ordered: T[] = [];
  let from = start;

  if (!from && remaining.length > 0) {
    const first = remaining.shift() as T;
    ordered.push(first);
    from = coordsOf(first);
  }

  while (from && remaining.length > 0) {
    const origin: Coordinates = from;
    let nearest = 0;
    let nearestKm = Infinity;
    remaining.forEach((candidate, index) => {
      const km = distanceKm(origin, coordsOf(candidate) as Coordinates);
      if (km < nearestKm) {
        nearestKm = km;
        nearest = index;
      }
    });
    const [next] = remaining.splice(nearest, 1);
    ordered.push(next);
    from = coordsOf(next);
  }

  return [...ordered, ...unmeasured];
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface PersonalTrailSummary extends TrailSummary {
  stopCount: number;
}

/**
 * The caller's own trails, most recently changed first, for the Trails tab's
 * "Your trails" section. Shaped as a TrailSummary (theme, duration, budget and
 * credential are always empty) plus a stop count. To open one, use
 * fetchTrailDetail from trail-query.ts: it already returns a personal trail
 * to its owner, with each stop's name and coordinates.
 */
export async function fetchMyTrails(userId: string): Promise<PersonalTrailSummary[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("id, name")
    .eq("personal", true)
    .eq("created_by", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  const routes = data ?? [];
  if (routes.length === 0) return [];

  const { data: stopRows, error: stopsError } = await supabase
    .from("route_stops")
    .select("route_id")
    .in(
      "route_id",
      routes.map((r) => r.id)
    );

  if (stopsError) throw stopsError;
  const counts = new Map<string, number>();
  for (const row of stopRows ?? []) {
    counts.set(row.route_id, (counts.get(row.route_id) ?? 0) + 1);
  }

  return routes.map((row) => ({
    id: row.id,
    name: row.name,
    theme: null,
    estimated_duration: null,
    estimated_budget: null,
    run_type: null,
    credentialName: null,
    stopCount: counts.get(row.id) ?? 0,
  }));
}

/**
 * Ids of the places and businesses that hold a place entry (a secret to
 * unlock), for the builder's "Has a secret" mark. Ids only: the database
 * function (0055) never returns entry text, and lists only places the caller
 * could already read. Place and business ids are uuids from separate tables
 * that never collide in practice, so one flat set is enough, the same way the
 * picker's savedIds works.
 */
export async function fetchLocationsWithEntries(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("locations_with_entries");
  if (error) throw error;
  return new Set(((data ?? []) as { location_id: string }[]).map((row) => row.location_id));
}

/**
 * Stored opening hours for the given stops, by id, for the builder's open or
 * closed mark (getOpenStatus in hours.ts reads the text). One lookup serves a
 * stop just picked and a stop loaded from a saved trail, so the picker needs
 * no extra columns. A stop that can no longer be read (RLS) is simply absent.
 */
export async function fetchStopHours(stops: PersonalStop[]): Promise<Map<string, string | null>> {
  const placeIds = stops.filter((s) => s.type === "place").map((s) => s.id);
  const businessIds = stops.filter((s) => s.type === "business").map((s) => s.id);

  const [places, businesses] = await Promise.all([
    placeIds.length > 0
      ? supabase.from("places").select("id, operating_hours").in("id", placeIds)
      : Promise.resolve({ data: [] as { id: string; operating_hours: string | null }[], error: null }),
    businessIds.length > 0
      ? supabase.from("businesses").select("id, opening_hours").in("id", businessIds)
      : Promise.resolve({ data: [] as { id: string; opening_hours: string | null }[], error: null }),
  ]);

  if (places.error) throw places.error;
  if (businesses.error) throw businesses.error;

  const hours = new Map<string, string | null>();
  for (const row of places.data ?? []) hours.set(row.id, row.operating_hours);
  for (const row of businesses.data ?? []) hours.set(row.id, row.opening_hours);
  return hours;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

async function assertOwned(userId: string, routeId: string): Promise<void> {
  const { data, error } = await supabase
    .from("routes")
    .select("id")
    .eq("id", routeId)
    .eq("personal", true)
    .eq("created_by", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PersonalTrailError("not_yours", "This trail couldn't be found.");
}

async function touch(routeId: string): Promise<void> {
  const { error } = await supabase
    .from("routes")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", routeId);
  if (error) throw error;
}

// A new stop must be a real place or business the public can see. route_stops.
// stop_id has no foreign key (0005), so nothing else stops a made-up id. A
// place must be verified (places have no public pending state, 0003). A
// business may be verified or pending (0015), the same rule the Saved page
// uses, so a rejected business cannot be added. Same idea as
// admin-trail-builder.tsx's check for staff, repeated here because that one is
// private to the page.
async function assertPickable(stops: PersonalStop[]): Promise<void> {
  const placeIds = stops.filter((s) => s.type === "place").map((s) => s.id);
  const businessIds = stops.filter((s) => s.type === "business").map((s) => s.id);

  const [places, businesses] = await Promise.all([
    placeIds.length > 0
      ? supabase.from("places").select("id").eq("verification_status", "verified").in("id", placeIds)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    businessIds.length > 0
      ? supabase.from("businesses").select("id").in("verification_status", ["verified", "pending"]).in("id", businessIds)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);

  if (places.error) throw places.error;
  if (businesses.error) throw businesses.error;

  const valid = new Set([...(places.data ?? []), ...(businesses.data ?? [])].map((r) => r.id));
  if (stops.some((s) => !valid.has(s.id))) {
    throw new PersonalTrailError(
      "stop_unavailable",
      "A stop you picked is no longer available. Refresh and try again."
    );
  }
}

const stopKey = (s: PersonalStop) => `${s.type}:${s.id}`;

/**
 * Makes the trail's stops exactly `stops`, in that order (the caller orders
 * them, see orderNearestNext). A repeated stop is kept once.
 *
 * Same method as admin-trail-builder.tsx's persistStops: a stop that is already
 * on the trail keeps its row, only its position changes, so route_progress
 * (which points at a stop row, on delete cascade) survives an edit. Only a stop
 * taken off the trail is deleted, and only a stop new to it is inserted. Removed
 * first, so the 12 stop cap counts the right rows. Two passes move the kept
 * rows, through a negative position, because (route_id, sequence_order) is
 * unique and two rows swapping would collide.
 *
 * Not atomic: a failure part way leaves the trail between the old and new
 * list. Safe to run again with the same list.
 */
export async function savePersonalTrailStops(
  userId: string,
  routeId: string,
  stops: PersonalStop[]
): Promise<void> {
  const next = [...new Map(stops.map((s) => [stopKey(s), s])).values()];
  if (next.length > PERSONAL_STOP_LIMIT) {
    throw new PersonalTrailError("stop_limit", `A trail can have up to ${PERSONAL_STOP_LIMIT} stops.`);
  }

  await assertOwned(userId, routeId);

  const { data, error } = await supabase
    .from("route_stops")
    .select("id, stop_type, stop_id, sequence_order")
    .eq("route_id", routeId);
  if (error) throw error;
  const current = data ?? [];

  const currentByKey = new Map(current.map((row) => [`${row.stop_type}:${row.stop_id}`, row]));
  const nextKeys = new Set(next.map(stopKey));

  const removedIds = current.filter((row) => !nextKeys.has(`${row.stop_type}:${row.stop_id}`)).map((row) => row.id);
  const added = next.filter((s) => !currentByKey.has(stopKey(s)));

  if (added.length > 0) await assertPickable(added);

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase.from("route_stops").delete().in("id", removedIds);
    if (deleteError) rethrow(deleteError);
  }

  // Kept stops whose position changes. One already in place is left alone, and
  // since targets are unique it cannot collide with a row that moves.
  const moves = next.flatMap((s, index) => {
    const row = currentByKey.get(stopKey(s));
    return row && row.sequence_order !== index ? [{ id: row.id, to: index }] : [];
  });

  for (const [i, move] of moves.entries()) {
    const { error: offsetError } = await supabase
      .from("route_stops")
      .update({ sequence_order: -(i + 1) })
      .eq("id", move.id);
    if (offsetError) rethrow(offsetError);
  }
  for (const move of moves) {
    const { error: moveError } = await supabase
      .from("route_stops")
      .update({ sequence_order: move.to })
      .eq("id", move.id);
    if (moveError) rethrow(moveError);
  }

  if (added.length > 0) {
    const { error: insertError } = await supabase.from("route_stops").insert(
      added.map((s) => ({
        route_id: routeId,
        stop_type: s.type,
        stop_id: s.id,
        sequence_order: next.indexOf(s),
      }))
    );
    if (insertError) rethrow(insertError);
  }

  await touch(routeId);
}

/**
 * Creates a personal trail and its stops, returns the new trail id. If the
 * stops fail to save, the empty trail is removed again so a failed Save does
 * not leave a stray "My trail" behind, then the error is rethrown.
 */
export async function createPersonalTrail(userId: string, name: string, stops: PersonalStop[]): Promise<string> {
  if (stops.length > PERSONAL_STOP_LIMIT) {
    throw new PersonalTrailError("stop_limit", `A trail can have up to ${PERSONAL_STOP_LIMIT} stops.`);
  }

  const { data, error } = await supabase
    .from("routes")
    .insert({ name: cleanTrailName(name), personal: true, created_by: userId })
    .select("id")
    .single();
  if (error) rethrow(error);

  const routeId = (data as { id: string }).id;
  try {
    await savePersonalTrailStops(userId, routeId, stops);
  } catch (stopError) {
    await deletePersonalTrail(userId, routeId).catch(() => {
      // Best effort: the original error is the one worth reporting.
    });
    throw stopError;
  }
  return routeId;
}

export async function renamePersonalTrail(userId: string, routeId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("routes")
    .update({ name: cleanTrailName(name), updated_at: new Date().toISOString() })
    .eq("id", routeId)
    .eq("personal", true)
    .eq("created_by", userId);
  if (error) throw error;
}

/** Deletes the trail. Its stops, progress and unlocks follow by cascade. */
export async function deletePersonalTrail(userId: string, routeId: string): Promise<void> {
  const { error } = await supabase
    .from("routes")
    .delete()
    .eq("id", routeId)
    .eq("personal", true)
    .eq("created_by", userId);
  if (error) throw error;
}
