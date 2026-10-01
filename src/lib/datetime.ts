// Shared Date <-> "YYYY-MM-DDTHH:mm" conversions, the exact shape every
// datetime-local input in this codebase already used (admin-event-
// detail.tsx's own former toDatetimeLocalValue, moved here verbatim).
// Pulled into lib/ so the reusable calendar (Phase 5, Custom Calendar
// Component: calendar.tsx, time-field.tsx, datetime-field.tsx) and any
// future date field (Phase 5.9's "reaches for the same calendar component"
// instruction) share one conversion instead of each file re-deriving it,
// per constraints.md's Inventory Before Suggesting rule.

export function toDateTimeLocalValue(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Reads back either this shape's own "YYYY-MM-DDTHH:mm" local value or a
// full ISO string (a timestamptz column read straight from Supabase) --
// both parse correctly through the native Date constructor, same as
// admin-event-detail.tsx's old toDatetimeLocalValue relied on.
export function parseDateTimeLocalValue(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Convenience for the common "load a DB row's ISO timestamp straight into
// form state" call site, same single call admin-event-detail.tsx's old
// toDatetimeLocalValue(isoString) covered on its own.
export function isoToDateTimeLocalValue(isoString: string | null): string {
  return toDateTimeLocalValue(parseDateTimeLocalValue(isoString));
}

// Date-only "YYYY-MM-DD" -- the exact value shape a native
// `<input type="date">` reads/writes, used by datetime-field.tsx's typable
// date input (Amkor-parity fix: typing a date directly, not only picking
// one from the popup calendar). Kept separate from toDateTimeLocalValue
// above since that one always carries a time component too.
export function toDateOnlyValue(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}


// ---------------------------------------------------------------------------
// Date and time kept as two separate values (the Announcements form).
//
// An event always has a date, but not always a time. The events table has one
// timestamptz column per moment (date_time, end_date_time) and no "has a time"
// flag, so "no time" is stored as local midnight (00:00) and read back the
// same way: 00:00 means no time was set. The cost is that an event cannot
// start at exactly 12:00 AM; the time list in the form starts at 12:15 AM to
// match. A real flag column would remove that limit, but it is a migration
// plus a change to every query that reads these columns.
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" + optional "HH:mm" -> ISO string for the column, or null with no date. */
export function combineDateAndTime(dateValue: string, timeValue: string): string | null {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return null;
  const [hours, minutes] = timeValue ? timeValue.split(":").map(Number) : [0, 0];
  return new Date(year, month - 1, day, hours || 0, minutes || 0).toISOString();
}

/** ISO string from the column -> separate "YYYY-MM-DD" and "HH:mm" ("" when no time was set). */
export function splitDateAndTime(isoString: string | null): { date: string; time: string } {
  const parsed = parseDateTimeLocalValue(isoString);
  if (!parsed) return { date: "", time: "" };
  const time = hasTimeOfDay(parsed) ? toDateTimeLocalValue(parsed).slice(11) : "";
  return { date: toDateOnlyValue(parsed), time };
}

/** False for local midnight, which is how "no time set" is stored. */
export function hasTimeOfDay(date: Date): boolean {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

// Date and time for display, never with seconds. A bare toLocaleString()
// includes them ("10/1/2026, 5:30:00 AM"), so every place that shows a
// timestamp goes through this instead. Same short numeric look, minus the
// seconds: "10/1/2026, 5:30 AM".
export function formatDateTimeNoSeconds(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "YYYY-MM-DD" -> local Date at midnight, or null when empty or malformed.
// What DateField and the date range filters use to turn a field's value back
// into a Date (for min/max, or for the popup calendar's selected day).
export function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}
