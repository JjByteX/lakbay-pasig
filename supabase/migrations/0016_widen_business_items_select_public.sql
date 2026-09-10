-- Phase 6.4 (step-5-phases.md), found while building the Discover business
-- detail page. Human-confirmed before writing, per constraints.md's No
-- Silent Overrides rule and architecture-notes.md's never-touch-without-
-- approval list (schema, RLS policies).
--
-- business_items_select_public (migration 0004) still checks the parent
-- business's verification_status = 'verified' only. Migration 0015 widened
-- businesses_select_public itself to 'verified' or 'pending', but never
-- touched this policy, so a pending business's item list silently returns
-- zero rows under RLS today, not an error, just an empty list, for the
-- exact case Phase 1 widened visibility to cover.
--
-- step-5-phases.md 6.4 scopes the item list through "the widened
-- businesses_select_public policy from Phase 1," i.e. the same visibility
-- as the parent business record. This migration brings business_items in
-- line with that: an item is visible whenever its parent business is
-- ('verified' or 'pending'), same two statuses, no new reasoning beyond
-- what 0015 already established. 'unverified' stays excluded, matching
-- the parent policy exactly (businesses have no 'rejected' value at all,
-- per migration 0004's check constraint, see 0015's own corrected note).
drop policy "business_items_select_public" on public.business_items;

create policy "business_items_select_public"
  on public.business_items for select
  using (
    exists (
      select 1 from public.businesses b
      where b.id = business_id and b.verification_status in ('verified', 'pending')
    )
  );
