-- Phase 1 (step-5-phases.md), step-5-plan.md section 4, Businesses
-- visibility. Human-confirmed per Phase 0.1, per constraints.md's No
-- Silent Overrides rule and architecture-notes.md's never-touch-without-
-- approval list (schema, RLS policies).
--
-- businesses_select_public (migration 0004) currently exposes
-- verification_status = 'verified' only, the same shape
-- places_select_public (migration 0003) uses for places. This widens it
-- to 'verified' or 'pending', places_select_public is intentionally left
-- unchanged, a place has no Basic tier concept per step-5-plan.md, it is
-- either reviewed and live or it is not.
--
-- Reasoning, checked across four independent sources rather than
-- assumed, per step-5-plan.md section 4:
-- - vendor-mode-spec.md: a Basic tier listing "goes live instantly" with
--   a visible Pending badge, not after review, and its own Filter
--   Behavior line says an item with no price "still displays normally in
--   listings and in Discover," written as if pending display in Discover
--   is already a given.
-- - feature-scope-changes.md: the Business Value Proposition is
--   visibility itself, in a directory people already check regularly.
--   That proposition does not hold if a new listing sits invisible until
--   CATO reviews it, at 300+ expected vendors reviewed at their own
--   pace, per vendor-mode-spec.md's own reasoning against gating Basic
--   listings in the first place.
-- - data-model.md: keeps Pending and Unverified as two separate
--   Verification Status values, which only matters if they are meant to
--   behave differently in front of a user, not just administratively.
-- - navigation-and-access-control.md's Guest access row says "search and
--   view places," dropping businesses, where every other mention of
--   Discover in that file pairs both nouns. Weighed against the three
--   sources above, this reads as inconsistent phrasing in a summary row,
--   not a deliberate scope cut.
--
-- 'unverified' stays excluded, per migration 0004's own check constraint
-- businesses only ever hold 'pending', 'verified', or 'unverified',
-- there is no 'rejected' value for this table (unlike places, migration
-- 0003, which does have 'rejected'). 'unverified' is the outcome of a
-- completed review a business did not pass, not a listing waiting on
-- one. Per step-5-plan.md's own instruction, the Discover UI must pair
-- this widen with a "Pending Verification" badge, visually distinct from
-- the Verified badge (vendor-mode-spec.md), so an unreviewed listing
-- never borrows the look of institutional trust it has not earned yet.
-- That UI pairing is Phase 6 of step-5-phases.md, not part of this
-- migration, but this widen must not ship to the public app without it.
drop policy "businesses_select_public" on public.businesses;

create policy "businesses_select_public"
  on public.businesses for select
  using (verification_status in ('verified', 'pending'));
