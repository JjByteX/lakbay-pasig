-- Fix: profiles_select_admin and profiles_update_admin (0001) re-query
-- public.profiles inside their own policy to check staff_role = 'admin'.
-- Postgres must evaluate RLS on that inner query too, which references the
-- same table the outer policy is protecting. This is why login worked
-- fine while staff_role was null (only profiles_select_own matched, no
-- self-reference triggered) and stopped working the moment staff_role was
-- set to 'admin' (the admin policy's own subquery now has to resolve
-- against the row it is trying to grant access to).
--
-- Fix: move the staff_role check into a security definer function. It
-- runs with the privileges of its owner, bypassing RLS internally for
-- this one lookup, so the policy no longer recurses into itself.
create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and staff_role = 'admin'
  );
$$;

drop policy "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

drop policy "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin());
