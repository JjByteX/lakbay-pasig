// Start and end dates for fixed-date fiestas (migration 0044). Pure helpers
// with no imports, so the self-check below runs under plain Node.
//
// A fiesta repeats every year, so the YEAR in start_date and end_date means
// nothing: it only carries the month and day, and it is never shown. The
// admin form writes date_label from the two dates ("April 17-18",
// "April 30 - May 1"), and every reader keeps showing date_label. Dates are
// "YYYY-MM-DD" strings, the shape DateField already uses, and are read by
// slicing the string, never through a Date, so no timezone can shift a day.
// No time of day, on purpose.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// Same cap as fiestas_end_date_check in 0044.
export const MAX_SPAN_DAYS = 31;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(value: string): { year: number; month: number; day: number } | null {
  const m = DATE_PATTERN.exec(value);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

// The month number (1-12) a start date fixes, or null with no valid date.
// Written into the month column so sorting and the month check in 0044 agree.
export function monthOfDate(value: string): number | null {
  return parts(value)?.month ?? null;
}

// Whole days from start to end, by calendar day (UTC math on the parts, so
// daylight saving cannot add or drop one).
function daysBetween(start: string, end: string): number | null {
  const a = parts(start);
  const b = parts(end);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

// The text written into date_label: "April 17", "April 17-18" (same month),
// or "April 30 - May 1" (across months). Null with no start date, which
// means the label is hand-written (a rule-based fiesta like "3rd Sunday of
// November").
export function spanLabel(startDate: string, endDate: string): string | null {
  const s = parts(startDate);
  if (!s) return null;
  const startText = `${MONTH_NAMES[s.month - 1]} ${s.day}`;
  const e = endDate ? parts(endDate) : null;
  if (!e) return startText;
  if (e.month === s.month) return `${startText}-${e.day}`;
  return `${startText} - ${MONTH_NAMES[e.month - 1]} ${e.day}`;
}

// What is wrong with the dates, in the words the form shows, or null when
// they are fine (including none at all). Mirrors fiestas_end_date_check in
// 0044 so a bad range is caught before the database rejects it.
export function spanProblem(startDate: string, endDate: string): string | null {
  if (!endDate) return null;
  if (!startDate) return "Add a start date before the end date.";
  const days = daysBetween(startDate, endDate);
  if (days === null) return null;
  if (days <= 0) return "The end date must come after the start date.";
  if (days > MAX_SPAN_DAYS) return `A fiesta runs at most ${MAX_SPAN_DAYS} days. Check the end date.`;
  return null;
}

// Ponytail's non-trivial-logic rule: the smallest runnable check. Run with:
// npx tsx src/lib/fiesta-dates.ts
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  };

  assertEqual(spanLabel("2026-04-17", "2026-04-18"), "April 17-18", "same-month span");
  assertEqual(spanLabel("2026-04-17", ""), "April 17", "single day");
  assertEqual(spanLabel("2026-04-30", "2026-05-01"), "April 30 - May 1", "span across months");
  assertEqual(spanLabel("2026-12-31", "2027-01-02"), "December 31 - January 2", "span across years");
  assertEqual(spanLabel("", ""), null, "no start date means a hand-written label");
  assertEqual(spanLabel("2020-02-29", ""), "February 29", "Feb 29 reads back unchanged");

  assertEqual(monthOfDate("2026-04-17"), 4, "month of a date");
  assertEqual(monthOfDate(""), null, "month of nothing");

  assertEqual(spanProblem("", ""), null, "no dates is fine");
  assertEqual(spanProblem("2026-04-17", ""), null, "start only is fine");
  assertEqual(spanProblem("2026-04-17", "2026-04-18"), null, "valid span");
  assertEqual(spanProblem("", "2026-04-18"), "Add a start date before the end date.", "end without start");
  assertEqual(spanProblem("2026-04-17", "2026-04-17"), "The end date must come after the start date.", "end equals start");
  assertEqual(spanProblem("2026-04-17", "2026-04-10"), "The end date must come after the start date.", "end before start");
  assertEqual(spanProblem("2026-04-17", "2026-05-17"), null, "30 days is allowed");
  assertEqual(spanProblem("2026-01-01", "2026-02-01"), null, "exactly 31 days is allowed");
  assertEqual(spanProblem("2026-01-01", "2026-02-02"), "A fiesta runs at most 31 days. Check the end date.", "32 days");
  assertEqual(spanProblem("2026-04-17", "2030-04-18"), "A fiesta runs at most 31 days. Check the end date.", "mistyped year");

  console.log("fiesta-dates.ts demo: all checks passed");
}

// Same Node-only guard as barangay.ts: `process` doesn't exist in the Vite
// browser bundle, and this must never fire on import.
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
