-- Fix: 42P17 infinite recursion detected in policy for relation "profiles",
-- still reproducible after 0009 and 0010.
--
-- 0009 and 0010 fixed every *self*-referencing policy on profiles (where a
-- profiles policy queried profiles itself), but profiles_select_staff_business_submitters
-- (added in 0010) queries public.businesses:
--
--   exists (select 1 from public.businesses b where b.submitted_by = profiles.id)
--
-- businesses has RLS enabled, and businesses_select_staff (0004) queries
-- public.profiles p to check staff_role/system_permission. So evaluating
-- profiles_select_staff_business_submitters requires evaluating
-- businesses_select_staff, which requires evaluating profiles' policies
-- again, including profiles_select_staff_business_submitters. This is a
-- two-table cycle, not a self-reference, which is why 0009/0010's fix
-- (correct for the self-reference case) didn't catch it.
--
-- Fix: businesses_select_staff and businesses_update_staff move their
-- staff_role/system_permission check into the same security definer
-- functions used on profiles (is_admin(), has_permission()). Those
-- functions bypass RLS internally, so evaluating them no longer re-enters
-- businesses_select_staff's exists() clause, and the cycle back into
-- profiles' policies is broken at this link.
--
-- Note: many other tables (places, routes, events, business_items,
-- business_reviews, business_flags, etc.) have the same inline
-- `exists (select 1 from public.profiles p where ...)` pattern as
-- businesses_select_staff had. Those are NOT fixed here because no
-- profiles policy queries them, so they don't complete a cycle back into
-- profiles — this migration only fixes the one link that does.

drop policy "businesses_select_staff" on public.businesses;
create policy "businesses_select_staff"
  on public.businesses for select
  using (public.is_admin() or public.has_permission('review_businesses'));

drop policy "businesses_update_staff" on public.businesses;
create policy "businesses_update_staff"
  on public.businesses for update
  using (public.is_admin() or public.has_permission('review_businesses'));
