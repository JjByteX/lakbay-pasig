-- Client decision: remove Nearby Places from a place's record. It was a
-- free-text field typed by staff (0003), never a link to real place rows,
-- and neither Google Maps nor Apple Maps carry it. Nothing downstream read
-- it: no public query (discover-query.ts, saved-places.ts, home-query.ts,
-- global-search.ts) or public page selected it, and no policy, function, or
-- view references it. The 0037 activity log diffs to_jsonb(old) against
-- to_jsonb(new) generically, so it has no hardcoded column to update.
--
-- Same drop-only shape as 0036: no replacement column, no backfill. App
-- code (admin-place-detail.tsx), supabase/seed.sql, and
-- supabase/activity_log_check.sql were updated ahead of this migration to
-- stop reading/writing the column. 0003 itself is not edited, per README's
-- migration rule.

alter table public.places
  drop column nearby_places;
