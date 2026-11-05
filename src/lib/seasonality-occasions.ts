import { supabase } from "./supabase";
import { matchOccasions, type Occasion, type OccasionSource } from "./seasonality-reasons";

// Database reads for seasonality reasons (docs/seasonal-visits-plan.md, Phase
// 4). The matching rule lives in seasonality-reasons.ts.

// Events store a moment in time. Read it as the Manila calendar day, the same
// clock the nightly job uses for visits.
function manilaDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

interface FiestaRow {
  id: string;
  name: string;
  month: number | null;
  start_date: string | null;
  end_date: string | null;
  related_place_id: string | null;
}

interface EventRow {
  id: string;
  title: string;
  date_time: string | null;
  end_date_time: string | null;
  related_place_id: string | null;
}

function fiestaSource(r: FiestaRow): OccasionSource {
  return { kind: "fiesta", id: r.id, name: r.name, month: r.month, start: r.start_date, end: r.end_date };
}

function eventSource(r: EventRow): OccasionSource {
  const start = manilaDate(r.date_time);
  return { kind: "event", id: r.id, name: r.title, month: null, start, end: manilaDate(r.end_date_time) };
}

/**
 * Published fiestas and events linked to the given places, keyed by place id.
 * Published only, on purpose: fiestas_select_staff and events_select_staff
 * carry no published check, so the filter is required, not just defensive.
 * Two plain queries for all places at once, so the planning report costs two
 * requests however many sites it lists.
 */
export async function fetchOccasionSources(placeIds: string[]): Promise<Map<string, OccasionSource[]>> {
  const bySite = new Map<string, OccasionSource[]>();
  if (placeIds.length === 0) return bySite;

  const [fiestas, events] = await Promise.all([
    supabase
      .from("fiestas")
      .select("id, name, month, start_date, end_date, related_place_id")
      .in("related_place_id", placeIds)
      .eq("published", true),
    supabase
      .from("events")
      .select("id, title, date_time, end_date_time, related_place_id")
      .in("related_place_id", placeIds)
      .eq("published", true),
  ]);
  if (fiestas.error) throw fiestas.error;
  if (events.error) throw events.error;

  const add = (placeId: string | null, src: OccasionSource) => {
    if (!placeId) return;
    const list = bySite.get(placeId);
    if (list) list.push(src);
    else bySite.set(placeId, [src]);
  };
  for (const row of (fiestas.data ?? []) as FiestaRow[]) add(row.related_place_id, fiestaSource(row));
  for (const row of (events.data ?? []) as EventRow[]) add(row.related_place_id, eventSource(row));
  return bySite;
}

/** Occasions that line up with one place's peaks, or [] for none and on any error. */
export async function fetchPlaceOccasions(
  placeId: string,
  peakMonths: number[],
  peakWeeks: number[],
): Promise<Occasion[]> {
  if (peakMonths.length === 0 && peakWeeks.length === 0) return [];
  try {
    const map = await fetchOccasionSources([placeId]);
    return matchOccasions(map.get(placeId) ?? [], peakMonths, peakWeeks);
  } catch {
    return [];
  }
}
