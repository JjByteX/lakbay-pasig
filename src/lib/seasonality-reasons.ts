/**
 * Seasonality reasons (docs/seasonal-visits-plan.md, Phase 4). Pure matching
 * with no imports, so the check at the bottom runs under plain Node; the
 * database reads are in seasonality-occasions.ts. Puts the Tourism
 * Office's published fiestas and events next to a place's peak months and
 * weeks, so a label can say "Around the same time: Pasig Town Fiesta".
 *
 * The link is the one staff already make: a fiesta or event whose
 * related_place_id is this place. Nothing new is tagged by hand, and no
 * migration is needed (fiestas_select_public and events_select_public already
 * expose published rows). Businesses have no such link, so they get no reasons.
 *
 * This is timing, not proof. The wording everywhere is "around the same time",
 * never "because". Informational only: nothing here feeds ranking or
 * recommendations (#40, #54).
 */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Non-leap year, the same convention as the week labels in seasonality.ts.
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Longest span that can explain a peak, the same cap as fiestas_end_date_check. */
const MAX_SPAN_DAYS = 31;

/** Most reasons shown for one place. */
const MAX_REASONS = 3;

export interface Occasion {
  kind: "fiesta" | "event";
  id: string;
  name: string;
  /** Short date text such as "Dec 16 – 24", or "Nov" when only the month is known. */
  when: string;
  /** Sort key: day of year, or 0 for month-only fiestas. */
  sortDay: number;
}

/** A fiesta or event as read from the database, before matching. */
export interface OccasionSource {
  kind: "fiesta" | "event";
  id: string;
  name: string;
  /** Month (1 to 12), for a fiesta with no exact dates. */
  month: number | null;
  /** First and last day as "YYYY-MM-DD". The year is ignored. Null for month-only. */
  start: string | null;
  end: string | null;
}

function dayOfYear(month: number, day: number): number {
  return DAYS_BEFORE_MONTH[month - 1] + day;
}

function weekOfDay(doy: number): number {
  return Math.min(52, Math.floor((doy - 1) / 7) + 1);
}

function parse(value: string | null): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function whenLabel(a: { month: number; day: number }, b: { month: number; day: number } | null): string {
  const start = `${MONTH_SHORT[a.month - 1]} ${a.day}`;
  if (!b || (b.month === a.month && b.day === a.day)) return start;
  if (b.month === a.month) return `${start} – ${b.day}`;
  return `${start} – ${MONTH_SHORT[b.month - 1]} ${b.day}`;
}

/**
 * The occasion if it lines up with the place's peaks, otherwise null.
 *
 * Dated occasions match on weeks when the place has peak weeks: any week of the
 * occasion is a peak week. A place with no peak weeks falls back to months.
 * A fiesta with only a month (a rule-based one such as "3rd Sunday of
 * November") can only match on months. Weeks are the precise signal, so a
 * dated occasion that falls in a peak month but misses every peak week is not
 * listed: the place did not spike for it.
 */
export function matchOccasion(
  src: OccasionSource,
  peakMonths: number[],
  peakWeeks: number[],
): Occasion | null {
  const a = parse(src.start);
  if (!a) {
    if (src.month === null || !peakMonths.includes(src.month)) return null;
    return { kind: src.kind, id: src.id, name: src.name, when: MONTH_SHORT[src.month - 1], sortDay: 0 };
  }

  const b = parse(src.end);
  const startDoy = dayOfYear(a.month, a.day);
  let endDoy = b ? dayOfYear(b.month, b.day) : startDoy;
  // A span across New Year, or an end before the start, is read as one day.
  if (endDoy < startDoy) endDoy = startDoy;
  // A long-running event (an exhibit) is not an occasion that explains a peak.
  if (endDoy - startDoy > MAX_SPAN_DAYS) return null;

  const weeks: number[] = [];
  for (let w = weekOfDay(startDoy); w <= weekOfDay(endDoy); w += 1) weeks.push(w);

  const matches =
    peakWeeks.length > 0
      ? weeks.some((w) => peakWeeks.includes(w))
      : peakMonths.includes(a.month) || (b !== null && peakMonths.includes(b.month));
  if (!matches) return null;

  return { kind: src.kind, id: src.id, name: src.name, when: whenLabel(a, b), sortDay: startDoy };
}

// Fiestas first, then by day of the year, then by name.
function compareOccasions(x: Occasion, y: Occasion): number {
  if (x.kind !== y.kind) return x.kind === "fiesta" ? -1 : 1;
  return x.sortDay - y.sortDay || x.name.localeCompare(y.name);
}

/**
 * Up to three occasions that line up with the peaks. Fiestas come before
 * events. An event that repeats yearly appears once per title. Within each
 * group, calendar order.
 */
export function matchOccasions(
  sources: OccasionSource[],
  peakMonths: number[],
  peakWeeks: number[],
): Occasion[] {
  const seen = new Set<string>();
  const found: Occasion[] = [];
  for (const src of sources) {
    const hit = matchOccasion(src, peakMonths, peakWeeks);
    if (!hit) continue;
    const key = `${hit.kind}:${hit.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(hit);
  }
  found.sort(compareOccasions);
  return found.slice(0, MAX_REASONS);
}

// Ponytail's non-trivial-logic rule: the smallest runnable check. Run with:
// npx tsx src/lib/seasonality-reasons.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  };
  const fiesta = (id: string, name: string, month: number | null, start: string | null, end: string | null) =>
    ({ kind: "fiesta", id, name, month, start, end }) as OccasionSource;

  // Undas: Nov 1 to 2 is week 44 (doy 305 to 306). Peak week 44 matches.
  const undas = fiesta("1", "Undas", 11, "2026-11-01", "2026-11-02");
  assertEqual(matchOccasion(undas, [11], [44])?.when, "Nov 1 – 2", "dated match on week");
  assertEqual(matchOccasion(undas, [11], [20]), null, "dated, peak weeks elsewhere");
  assertEqual(matchOccasion(undas, [11], [])?.name, "Undas", "no peak weeks falls back to month");
  assertEqual(matchOccasion(undas, [3], []), null, "wrong month");

  // Month-only fiesta matches on months only.
  const rule = fiesta("2", "Barangay fiesta", 11, null, null);
  assertEqual(matchOccasion(rule, [11, 12], [44])?.when, "Nov", "month-only match");
  assertEqual(matchOccasion(rule, [5], []), null, "month-only miss");

  // Spans across months and weeks.
  const across = fiesta("3", "Long fiesta", 4, "2026-04-30", "2026-05-01");
  assertEqual(matchOccasion(across, [], [18])?.when, "Apr 30 – May 1", "span across months");
  assertEqual(matchOccasion(across, [5], [])?.id, "3", "end month counts");

  // An event over 31 days is not an occasion.
  const exhibit: OccasionSource = { kind: "event", id: "4", name: "Exhibit", month: null, start: "2026-03-01", end: "2026-06-01" };
  assertEqual(matchOccasion(exhibit, [3, 4, 5], []), null, "long event skipped");

  // Dedupe by title, fiestas first, capped at three.
  const ev = (id: string, title: string, start: string): OccasionSource =>
    ({ kind: "event", id, name: title, month: null, start, end: null });
  const list = matchOccasions(
    [ev("a", "Simbang Gabi", "2025-12-16"), ev("b", "Simbang Gabi", "2026-12-16"), undas, ev("c", "Parol Fair", "2026-12-17"), ev("d", "Concert", "2026-12-18")],
    [11, 12],
    [],
  );
  assertEqual(list.length, 3, "capped at three");
  assertEqual(list[0].name, "Undas", "fiesta first");
  assertEqual(list.filter((o) => o.name === "Simbang Gabi").length, 1, "yearly event listed once");

  console.log("seasonality-reasons.ts demo: all checks passed");
}

// Same Node-only guard as fiesta-dates.ts: `process` does not exist in the
// Vite browser bundle, and this must never fire on import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
