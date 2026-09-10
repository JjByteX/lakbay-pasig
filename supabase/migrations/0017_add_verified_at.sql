-- Phase 1 (step-6-phases.md), Home's "recently verified content" section.
-- Human-confirmed per constraints.md's No Silent Overrides rule and
-- architecture-notes.md's never-touch-without-approval list (schema).
--
-- places and businesses only carry updated_at (migrations 0003, 0004),
-- which moves on any edit, not only on first verification. A staff member
-- fixing a typo on an already-verified row would bump it back to the top
-- of "recently verified," which is not what that section means. verified_at
-- is a separate column that only moves when verification_status actually
-- transitions into 'verified', set from the app layer in the same
-- handleReviewSubmit path that already writes place_reviews/
-- business_reviews (admin-place-detail.tsx, admin-business-detail.tsx).
--
-- Nullable, no default: a pending or rejected/unverified row has never
-- been verified, so it has no verified_at value, not a placeholder one.
alter table public.places
  add column verified_at timestamptz;

alter table public.businesses
  add column verified_at timestamptz;

-- Backfill: existing verified rows (seed data or anything verified before
-- this migration ran) need a value to sort by. updated_at at migration time
-- is the closest available proxy, not a re-derivation of the real
-- verification moment, which this migration cannot recover. Only rows
-- already verified are touched, pending/rejected/unverified rows stay null.
update public.places
  set verified_at = updated_at
  where verification_status = 'verified';

update public.businesses
  set verified_at = updated_at
  where verification_status = 'verified';

-- No RLS change needed. verified_at is a plain column on an existing row,
-- covered by the same select policies (places_select_public,
-- businesses_select_public) that already expose every other column on a
-- verified row.
