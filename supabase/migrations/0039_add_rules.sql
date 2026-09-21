-- Rules: one optional free-text field on places and businesses ("no flash
-- photography", "dress modestly"), shown on their public detail pages.
--
-- Nullable, no default, no check: null means unset and the app decides what
-- that reads as, per decision-log.md entry #7. The 500 character cap lives in
-- the forms only, like every other text column on these tables. No backfill,
-- existing rows stay null.
--
-- No RLS or trigger change. The policies are row based, so places_select_
-- public, businesses_select_public, and the staff and owner write policies
-- already cover a new column. The 0037 activity log diffs to_jsonb(old)
-- against to_jsonb(new) generically, so a rules edit is logged with no
-- change to log_activity().
--
-- Assumes 0038 (drop places.nearby_places) is applied first. 0003 and 0004
-- are not edited, per README's migration rule.

alter table public.places
  add column rules text;

alter table public.businesses
  add column rules text;
