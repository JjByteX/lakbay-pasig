import { supabase } from "./supabase";
import type { TrailCredential, TrailDetail, TrailDiscoveryContent, TrailStop, TrailSummary } from "./trail-types";

// Step 7, Phase 1.2: catalog fetch, mirrors discover-query.ts's
// fetchPlaces/fetchBusinesses shape (a plain select scoped by an
// already-correct RLS policy, mapped into the local type). routes_select_
// public (migration 0005) already gates on status = 'published', so no
// extra .eq("status", "published") filter is needed here, same reasoning
// discover-query.ts's fetchPlaces gives for skipping a redundant
// verification_status filter.
//
// Credential name is resolved with a second query rather than an embedded
// select (`trail_credentials(credential_name)`), since trail_credentials
// has no row for every route (the seed data's still-draft Cultural Tour
// route has none, per supabase/seed.sql section 14's own comment), and a
// left-join embed plus a "did any come back" check is more code than one
// extra round trip for a list this small.
async function fetchCredentialNamesByRouteId(routeIds: string[]): Promise<Map<string, string>> {
  if (routeIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("trail_credentials")
    .select("credential_name, linked_route_id")
    .in("linked_route_id", routeIds);

  if (error) throw error;

  const byRouteId = new Map<string, string>();
  for (const row of data ?? []) {
    byRouteId.set(row.linked_route_id, row.credential_name);
  }
  return byRouteId;
}

/**
 * Phase 1.2: published trail catalog, trails.tsx's (Phase 2) fetch
 * target. One call, one typed list, same "one combined view" shape
 * discover-query.ts's fetchDiscoverResults already establishes for its
 * own surface.
 */
export async function fetchPublishedTrails(): Promise<TrailSummary[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("id, name, theme, estimated_duration, estimated_budget, run_type");

  if (error) throw error;
  const routes = data ?? [];

  const credentialNames = await fetchCredentialNamesByRouteId(routes.map((r) => r.id));

  return routes.map((row) => ({
    id: row.id,
    name: row.name,
    theme: row.theme,
    estimated_duration: row.estimated_duration,
    estimated_budget: row.estimated_budget,
    run_type: row.run_type,
    credentialName: credentialNames.get(row.id) ?? null,
  }));
}

// Phase 1.3: stop list plus name resolve. Same two-step pattern admin-
// trail-builder.tsx's loadStops already uses: fetch route_stops ordered
// by sequence_order, split ids by stop_type, batch-fetch names from
// places and businesses in parallel, merge into a lookup map. Reused
// here rather than reinvented, per constraints.md's Inventory Before
// Suggesting rule, route_stops.stop_id has no foreign key (migration
// 0005), this client resolve is the only way to get a display name.
//
// A name that resolves to nothing (stale stop_id, deleted row) falls
// back to "(unknown stop)" rather than throwing, matching admin-trail-
// builder.tsx's own "(deleted)" fallback for the same situation on the
// staff side — this is a data-integrity gap the app layer already knows
// about (architecture-notes.md's Known Fragile Areas), not something a
// public page should hard-fail on.
//
// Phase 4.5: latitude/longitude resolved in the same select as name,
// same round trip, not a second query. This is what trail-detail.tsx's
// proximity check compares the watched GPS position against — a stop
// has no coordinate of its own anywhere else (route_stops, discovery_
// content), the place/business it points at is the only source, per
// trail-types.ts's TrailStop comment.
interface ResolvedStop {
  name: string;
  latitude: number | null;
  longitude: number | null;
}

async function resolveStopLocations(
  stopRows: { id: string; stop_type: string; stop_id: string; sequence_order: number }[]
): Promise<Map<string, ResolvedStop>> {
  const placeIds = stopRows.filter((s) => s.stop_type === "place").map((s) => s.stop_id);
  const businessIds = stopRows.filter((s) => s.stop_type === "business").map((s) => s.stop_id);

  type Row = { id: string; name: string; latitude: number | null; longitude: number | null };

  const [placesRes, businessesRes] = await Promise.all([
    placeIds.length
      ? supabase.from("places").select("id, name, latitude, longitude").in("id", placeIds)
      : Promise.resolve({ data: [] as Row[] }),
    businessIds.length
      ? supabase.from("businesses").select("id, name, latitude, longitude").in("id", businessIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const byId = new Map<string, ResolvedStop>();
  for (const row of placesRes.data ?? []) {
    byId.set(row.id, { name: row.name, latitude: row.latitude, longitude: row.longitude });
  }
  for (const row of businessesRes.data ?? []) {
    byId.set(row.id, { name: row.name, latitude: row.latitude, longitude: row.longitude });
  }
  return byId;
}

// Phase 1.4: discovery content, keyed by related_route_stop_id, same
// filter-out-unlinked-rows step admin-trail-builder.tsx's
// loadDiscoveryContent already applies (a row with no related_route_
// stop_id can't be attached to a stop's render). needs_place_review is
// deliberately not selected here, unlike the admin page's own query,
// per trail-types.ts's TrailDiscoveryContent comment: a public read has
// no use for a staff-only routing flag, and discovery_content_select_
// public (0005) already gates the row on status/publication before this
// runs.
async function fetchDiscoveryContentByStopId(
  routeId: string
): Promise<Map<string, TrailDiscoveryContent>> {
  const { data, error } = await supabase
    .from("discovery_content")
    .select("id, related_route_stop_id, title, content, unlock_radius")
    .eq("route_id", routeId);

  if (error) throw error;

  const byStopId = new Map<string, TrailDiscoveryContent>();
  for (const row of data ?? []) {
    if (row.related_route_stop_id === null) continue;
    byStopId.set(row.related_route_stop_id, {
      id: row.id,
      title: row.title,
      content: row.content,
      unlock_radius: row.unlock_radius,
    });
  }
  return byStopId;
}

async function fetchCredential(routeId: string): Promise<TrailCredential | null> {
  const { data, error } = await supabase
    .from("trail_credentials")
    .select("id, credential_name, requirement_to_earn")
    .eq("linked_route_id", routeId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Phase 1.3-1.4: full single-route detail, trail-detail.tsx's (Phase 3)
 * fetch target. Returns null when the route id doesn't resolve to a
 * published row, same "not found" shape discover-place-detail.tsx's own
 * .maybeSingle() check already uses for a single-record public page,
 * routes_select_public (0005) means a draft or nonexistent id and a
 * genuinely-missing id read identically here, both are "nothing to
 * show."
 */
export async function fetchTrailDetail(routeId: string): Promise<TrailDetail | null> {
  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("id, name, theme, estimated_duration, estimated_budget, run_type")
    .eq("id", routeId)
    .maybeSingle();

  if (routeError) throw routeError;
  if (!route) return null;

  const { data: stopRows, error: stopsError } = await supabase
    .from("route_stops")
    .select("id, stop_type, stop_id, sequence_order")
    .eq("route_id", routeId)
    .order("sequence_order", { ascending: true });

  if (stopsError) throw stopsError;
  const rows = stopRows ?? [];

  const [locationByStopId, discoveryByStopId, credential] = await Promise.all([
    resolveStopLocations(rows),
    fetchDiscoveryContentByStopId(routeId),
    fetchCredential(routeId),
  ]);

  const stops: TrailStop[] = rows.map((s) => {
    const resolved = locationByStopId.get(s.stop_id);
    return {
      id: s.id,
      stop_type: s.stop_type as "place" | "business",
      stop_id: s.stop_id,
      sequence_order: s.sequence_order,
      name: resolved?.name ?? "(unknown stop)",
      latitude: resolved?.latitude ?? null,
      longitude: resolved?.longitude ?? null,
      discoveryContent: discoveryByStopId.get(s.id) ?? null,
    };
  });

  return {
    id: route.id,
    name: route.name,
    theme: route.theme,
    estimated_duration: route.estimated_duration,
    estimated_budget: route.estimated_budget,
    run_type: route.run_type,
    stops,
    credential,
  };
}
