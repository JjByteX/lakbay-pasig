-- 0054: personal trails. A signed-in user builds a private trail from places
-- and businesses, then walks it with the same player as an official trail.
-- Same tables, one flag. See docs/user-trails-plan.md.
--
-- What this keeps true:
--   a personal trail is a draft, owned by its creator, and never published
--   only the owner can read or change it, staff included
--   it never reaches completed_routes (insert or update), so no credential
--   and no vendor stats
--   10 trails per user, 12 stops per trail
--
-- Not touched on purpose: the activity_log triggers. write_activity() (0037)
-- already writes nothing for a non-staff actor, so a resident's trail edits
-- are never logged.

alter table public.routes
  add column personal boolean not null default false;

alter table public.routes
  add constraint routes_personal_draft_owned
  check (not personal or (status = 'draft' and created_by is not null));

-- Owner access. with check pins personal = true and created_by = me, so a
-- user can neither spoof an owner nor flip a trail to official.
create policy "routes_own_personal"
  on public.routes for all
  using (personal and created_by = auth.uid())
  with check (personal and created_by = auth.uid());

create policy "route_stops_own_personal"
  on public.route_stops for all
  using (
    exists (
      select 1 from public.routes r
      where r.id = route_id and r.personal and r.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.routes r
      where r.id = route_id and r.personal and r.created_by = auth.uid()
    )
  );

-- The staff policies on routes and route_stops are "for all", so they grant
-- read as well as write. A restrictive policy narrows every permissive one
-- at once: a personal trail is visible and writable only to its owner.
create policy "routes_personal_owner_only"
  on public.routes as restrictive for all
  using (not personal or created_by = auth.uid());

create policy "route_stops_personal_owner_only"
  on public.route_stops as restrictive for all
  using (
    exists (
      select 1 from public.routes r
      where r.id = route_id and (not r.personal or r.created_by = auth.uid())
    )
  );

-- Place entries (0050) show through a published trail. They now also show
-- through a personal trail the caller owns, so a user trail has something
-- to unlock. Trail notes (route_id set) stay staff-only and official-only.
drop policy "discovery_content_select_public" on public.discovery_content;

create policy "discovery_content_select_public"
  on public.discovery_content for select
  using (
    status = 'active'
    and (
      exists (
        select 1 from public.routes r
        where r.id = route_id and r.status = 'published'
      )
      or (
        route_id is null
        and exists (
          select 1
          from public.route_stops rs
          join public.routes r on r.id = rs.route_id
          where (r.status = 'published' or (r.personal and r.created_by = auth.uid()))
            and rs.stop_type = related_location_type
            and rs.stop_id = related_location_id
        )
      )
    )
  );

-- A finished personal trail writes no completion. Requiring a visible
-- official route (not just "not personal") also blocks a made-up route id,
-- since another user's personal trail is invisible to this check.
-- Two policies, because completed_routes_own (0007) is "for all": without the
-- update one, a user could insert an official completion and then point it at
-- their personal trail. Select and delete stay open, so a person can still
-- read and restart a trail that has since left the catalog.
create policy "completed_routes_official_only"
  on public.completed_routes as restrictive for insert
  with check (
    exists (
      select 1 from public.routes r
      where r.id = route_id and not r.personal
    )
  );

create policy "completed_routes_official_only_update"
  on public.completed_routes as restrictive for update
  with check (
    exists (
      select 1 from public.routes r
      where r.id = route_id and not r.personal
    )
  );

-- Caps. A trigger, not a policy: a policy with a count would also block
-- editing a trail that sits at the cap. The stop cap runs on insert and on a
-- change of route_id, so a stop cannot be moved from one of the user's trails
-- into a full one. An update that leaves route_id alone (a reorder) is not
-- counted, so a trail at the cap can still be reordered.
create function public.enforce_personal_trail_caps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'routes' then
    if new.personal
       and (select count(*) from public.routes
            where personal and created_by = new.created_by) >= 10 then
      raise exception 'personal_trail_limit';
    end if;
  else
    if tg_op = 'UPDATE' and new.route_id = old.route_id then
      return new;
    end if;
    if coalesce((select personal from public.routes where id = new.route_id), false)
       and (select count(*) from public.route_stops
            where route_id = new.route_id) >= 12 then
      raise exception 'personal_stop_limit';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_personal_trail_caps() from public, anon, authenticated;

create trigger personal_trail_cap
  before insert on public.routes
  for each row execute function public.enforce_personal_trail_caps();

create trigger personal_stop_cap
  before insert or update of route_id on public.route_stops
  for each row execute function public.enforce_personal_trail_caps();

-- routes.created_by references profiles with no cascade, so a user who owns a
-- personal trail could not delete their account. Same function as 0049 with
-- one added delete. Stops, progress and unlocks follow by cascade.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_uid
      and (role <> 'resident' or staff_role is not null)
  ) then
    raise exception 'staff_account';
  end if;

  if exists (select 1 from public.businesses where submitted_by = v_uid) then
    raise exception 'has_business';
  end if;

  update public.business_flags set flagged_by = null where flagged_by = v_uid;

  delete from public.routes where personal and created_by = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;
