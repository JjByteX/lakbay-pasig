import { supabase } from "./supabase";

/**
 * Seasonality labels (docs/seasonal-visits-plan.md, Phases 2 and 3). Everything
 * comes from place_seasonality (migrations 0005 and 0006), rebuilt nightly from
 * verified visits, and from report_visit_planning() for the Tourism Office.
 * A place under the visit threshold, or an app under 12 months old, has no row,
 * so every failure and every empty answer reads the same: no label.
 * Informational only. Nothing here feeds ranking or recommendations (#40, #54).
 */

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface Seasonality {
  /** Calendar months (1 to 12). */
  peakMonths: number[];
  /** Week buckets (1 to 52) at 2x normal or more. */
  peakWeeks: number[];
  /** Slot codes such as "weekend_afternoon". */
  busySlots: string[];
  quietSlots: string[];
  busierNextWeek: boolean;
}

/** Everything known for a place or business, or null when there is no label. */
export async function fetchSeasonality(kind: "place" | "business", itemId: string): Promise<Seasonality | null> {
  const { data, error } = await supabase
    .from("place_seasonality")
    .select("peak_months, peak_weeks, busy_slots, quiet_slots, busier_next_week")
    .eq("kind", kind)
    .eq("item_id", itemId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    peakMonths: data.peak_months ?? [],
    peakWeeks: data.peak_weeks ?? [],
    busySlots: data.busy_slots ?? [],
    quietSlots: data.quiet_slots ?? [],
    busierNextWeek: data.busier_next_week === true,
  };
}

/** "Nov, Dec" for [11, 12], or null for none. */
export function peakMonthsLabel(months: number[]): string | null {
  const names = months.map((m) => MONTH_NAMES[m - 1]).filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

// Week buckets are fixed at 7 days from Jan 1 (the 52nd takes the leftover
// days). Dates are shown for a non-leap year, so after Feb 29 a leap year runs
// a day later: the label is "about" these dates.
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function dayLabel(doy: number): string {
  let month = 11;
  while (month > 0 && doy <= DAYS_BEFORE_MONTH[month]) month -= 1;
  return `${MONTH_NAMES[month]} ${doy - DAYS_BEFORE_MONTH[month]}`;
}

/** First and last day of a week bucket as "Oct 29 – Nov 4". */
export function weekRangeLabel(firstWeek: number, lastWeek = firstWeek): string {
  const start = (firstWeek - 1) * 7 + 1;
  const end = lastWeek >= 52 ? 365 : lastWeek * 7;
  return `${dayLabel(start)} – ${dayLabel(end)}`;
}

/** Consecutive weeks merged into runs: [43, 44, 45, 50] gives [[43, 45], [50, 50]]. */
export function weekRuns(weeks: number[]): [number, number][] {
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const w of sorted) {
    const last = runs.at(-1);
    if (last && w === last[1] + 1) last[1] = w;
    else runs.push([w, w]);
  }
  return runs;
}

/** "Oct 29 – Nov 4, Dec 17 – Dec 23", or null for none. */
export function peakWeeksLabel(weeks: number[]): string | null {
  const runs = weekRuns(weeks);
  return runs.length > 0 ? runs.map(([a, b]) => weekRangeLabel(a, b)).join(", ") : null;
}

const SLOT_LABEL: Record<string, string> = {
  weekday_morning: "weekday mornings",
  weekday_afternoon: "weekday afternoons",
  weekday_evening: "weekday evenings",
  weekend_morning: "weekend mornings",
  weekend_afternoon: "weekend afternoons",
  weekend_evening: "weekend evenings",
};

/** "weekday mornings and weekend evenings", or null for none. Two at most. */
export function slotsLabel(slots: string[]): string | null {
  const names = slots.map((s) => SLOT_LABEL[s]).filter(Boolean).slice(0, 2);
  return names.length > 0 ? names.join(" and ") : null;
}

/** True when any part of the label has something to show. */
export function hasSeasonality(s: Seasonality | null): s is Seasonality {
  return (
    s !== null &&
    (s.peakMonths.length > 0 ||
      s.peakWeeks.length > 0 ||
      s.busySlots.length > 0 ||
      s.quietSlots.length > 0 ||
      s.busierNextWeek)
  );
}

/** Week bucket (1 to 52) of a date, the same rule as the nightly job. */
export function weekOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000) + 1;
  return Math.min(52, Math.floor((doy - 1) / 7) + 1);
}

/** Today in Manila as a UTC-midnight date, so weekOfYear reads the Manila calendar day. */
export function manilaToday(now = new Date()): Date {
  const manila = new Date(now.getTime() + 8 * 3600 * 1000);
  return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()));
}

/** True when any peak week starts within the next `weeks` weeks (wrapping the year). */
export function peakWeekSoon(peakWeeks: number[], weeks = 8, today = manilaToday()): boolean {
  const current = weekOfYear(today);
  return peakWeeks.some((w) => {
    const ahead = (w - current + 52) % 52;
    return ahead <= weeks;
  });
}

/** One row of the Tourism Office planning view (report_visit_planning, migration 0006). */
export interface VisitPlanningRow {
  kind: "place" | "business";
  item_id: string;
  name: string | null;
  visits_12m: number;
  /** Visits per calendar month, Jan first, over the last 12 complete months. */
  monthly: number[];
  peak_months: number[];
  peak_weeks: number[];
  busier_next_week: boolean;
}

export async function fetchVisitPlanning(): Promise<VisitPlanningRow[]> {
  const { data, error } = await supabase.rpc("report_visit_planning");
  if (error) throw new Error(`Could not load visit counts: ${error.message}`);
  return (data ?? []) as VisitPlanningRow[];
}
