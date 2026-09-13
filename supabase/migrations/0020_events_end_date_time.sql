-- Adds an optional end date and time to events, alongside the existing
-- date_time (start). Nullable, same pattern as 0017's verified_at: most
-- events have no end time, so this is opt-in per row, not a required field.
-- Human-confirmed schema change per architecture-notes.md's never-touch-
-- without-approval list; see decision-log.md entry #6.
alter table public.events
  add column end_date_time timestamptz;
