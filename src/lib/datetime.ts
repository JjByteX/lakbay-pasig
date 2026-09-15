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

