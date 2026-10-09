-- 0055: which places and businesses have a place entry. Approved in the
-- personal trails thread, docs/user-trails-plan.md.
--
-- Why: the trail builder wants to mark the places that hold a secret, since
-- that is what makes a personal trail worth walking. Place entries are
-- readable only through a published trail or the caller's own personal trail
-- (0050, 0054), so before a place is on a trail the app cannot tell whether it
-- has any. This function answers only that, as ids. It never returns a title
-- or any text, so nothing about an entry leaks before it is unlocked.
--
-- What it keeps true:
--   security definer, so it can see entries the caller's RLS hides
--   returns only (type, id) pairs, no entry content
--   counts active place entries only (route_id is null), not trail notes
--   lists only places and businesses the caller could already read: verified
--   places (0003), verified or pending businesses (0015), so it cannot be
--   used to learn the id of an unverified place
--   signed in users only, anon cannot call it

create function public.locations_with_entries()
returns table (location_type text, location_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct dc.related_location_type, dc.related_location_id
  from public.discovery_content dc
  where dc.route_id is null
    and dc.status = 'active'
    and (
      (dc.related_location_type = 'place' and exists (
        select 1 from public.places p
        where p.id = dc.related_location_id and p.verification_status = 'verified'
      ))
      or
      (dc.related_location_type = 'business' and exists (
        select 1 from public.businesses b
        where b.id = dc.related_location_id and b.verification_status in ('verified', 'pending')
      ))
    );
$$;

revoke execute on function public.locations_with_entries() from public, anon;
grant execute on function public.locations_with_entries() to authenticated;
