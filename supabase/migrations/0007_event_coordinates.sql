-- Announcements: a map pin for an event's location, the same pin the place and
-- business forms keep (latitude and longitude, double precision, nullable).
-- Both stay null for existing events and for any event saved without a pin, so
-- nothing breaks: the text `location` column is unchanged and still what the
-- public pages show. Additive only. No policy or grant changes: events already
-- grants and protects the whole table, and activity_log_events logs any column.

alter table public.events
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
