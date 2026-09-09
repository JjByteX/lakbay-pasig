-- Phase 5.3 (step-4-phases.md, step-4-plan.md's review exception),
-- resolved in project-foundation/phase-5-decisions.md Decision 3.
--
-- admin-panel-spec.md's Review Action Log rule applies to every review
-- action, and step-4-phases.md 5.3 / step-4-plan.md both say to reuse the
-- existing table and verify/reject actions for Trail Content review, not
-- build a second queue. place_reviews (migration 0003) is that existing
-- table, but its place_id column is `not null references
-- public.places(id) on delete cascade` — a Trail Content review's
-- subject is a discovery_content.id, not a places.id, so it cannot be
-- logged into place_reviews as the column stood, without either a second,
-- parallel audit table (the exact "parallel version of something that
-- exists" constraints.md's Inventory Before Suggesting rule is against)
-- or widening this one.
--
-- Fix: replace place_id with the same type-plus-id pattern already used
-- twice in this codebase for "points at one of two tables" (route_stops.
-- stop_type/stop_id, discovery_content.related_location_type/
-- related_location_id, both in migration 0005). reviewed_type distinguishes
-- a place review from a discovery_content (Trail Content) review;
-- reviewed_id carries no foreign key, same tradeoff architecture-notes.md's
-- Known Fragile Areas already accepts for the other two pairs — the app
-- layer must guarantee it points at a real row in the matching table.
--
-- Existing rows are backfilled with reviewed_type = 'place',
-- reviewed_id = the old place_id value, so no review history is lost.
-- `on delete cascade` cannot be expressed on a column with no foreign
-- key; place_reviews rows for a deleted place or a deleted
-- discovery_content row are left in place after this migration rather
-- than silently disappearing, which is a stricter accountability
-- guarantee than before, not a weaker one — admin-panel-spec.md's Review
-- Action Log rule is that history "stays visible for accountability,"
-- which a delete-cascade on the log itself worked against even before
-- this migration.
alter table public.place_reviews
  add column reviewed_type text not null default 'place' check (reviewed_type in ('place', 'discovery_content')),
  add column reviewed_id uuid;

update public.place_reviews set reviewed_id = place_id where reviewed_id is null;

alter table public.place_reviews
  alter column reviewed_id set not null;

alter table public.place_reviews
  drop column place_id;

alter table public.place_reviews
  alter column reviewed_type drop default;

-- RLS policies (0003) are unchanged in shape, manage_places or admin,
-- neither policy referenced place_id directly, both carry over as-is. No
-- drop/recreate needed here, unlike migration 0013's discovery_content
-- policies, since this table's policies never named the column being
-- replaced.
