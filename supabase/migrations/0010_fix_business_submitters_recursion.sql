-- Fix: profiles_select_staff_business_submitters (0008) has the same
-- self-referencing pattern 0009 fixed on profiles_select_admin and
-- profiles_update_admin, but this policy was missed, its own USING clause
-- still runs `select 1 from public.profiles p where p.id = auth.uid() ...`
-- inside a policy that gates select access to public.profiles itself.
-- This is the actual cause of the 42P17 "infinite recursion detected in
-- policy" error still hit after 0009: 0009 only patched two of the three
-- self-referencing policies on this table, this is the third.
--
-- Fix: reuse is_admin() from 0009 for the staff_role = 'admin' half, add
-- has_permission() for the system_permission half, both security definer
-- so neither re-enters RLS on profiles.
create function public.has_permission(permission text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active_status = 'active'
      and permission = any(system_permission)
  );
$$;

drop policy "profiles_select_staff_business_submitters" on public.profiles;
create policy "profiles_select_staff_business_submitters"
  on public.profiles for select
  using (
    (public.is_admin() or public.has_permission('review_businesses'))
    and exists (
      select 1 from public.businesses b
      where b.submitted_by = profiles.id
    )
  );
