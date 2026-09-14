-- Category Directory Expansion, Phase 0.1/0.2. Human-confirmed per
-- constraints.md's No Silent Overrides rule and architecture-notes.md's
-- never-touch-without-approval list (schema). Logged in decision-log.md.
--
-- Gap: places.facilities was a text[] of raw strings, no fixed source,
-- hardcoded once in admin-place-detail.tsx's FACILITY_OPTIONS const. Adding
-- a facility meant a code change and a redeploy, no migration needed since
-- there was never a check constraint, but still not admin-manageable.
--
-- Unlike place_categories/trail_categories/event_categories, a place can
-- have several facilities at once. This is a many-to-many relationship,
-- kept as a uuid[] column on places rather than a join table, matching how
-- facilities themselves were already stored as an array, not turning a
-- one-column change into an extra table for the same shape of data.

-- 0.1: the facility directory. Same shape as place_categories (migration
-- 0022): name, icon, active, sort_order (unused by the app layer, kept for
-- the same reason place_categories/trail_categories/event_categories keep
-- it after the reorder rollback), created_at, updated_at.
create table public.place_facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 0.1: RLS. Public read on active rows, no sign-in required, same
-- no-`to`-clause shape place_categories_select_public (0022) already uses,
-- since the place form's facility picker and any future public-facing
-- facility chip both need this list without a session. Write limited to
-- manage_places or admin, matching who already owns Places itself (0003's
-- places_insert_staff/places_update_staff), since a facility is Place
-- content, not a new content type needing its own permission.
alter table public.place_facilities enable row level security;

create policy "place_facilities_select_public"
  on public.place_facilities for select
  using (active = true);

create policy "place_facilities_select_staff"
  on public.place_facilities for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

create policy "place_facilities_write_staff"
  on public.place_facilities for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

-- 0.1: seed the 4 existing values as rows, same names, so no existing
-- place loses a facility label. Icons per the expansion plan's shortlist,
-- one distinct icon per row.
insert into public.place_facilities (name, icon, sort_order) values
  ('Restrooms', 'bath', 1),
  ('Parking', 'square-parking', 2),
  ('Info Desk', 'info', 3),
  ('Waiting Area', 'armchair', 4);

-- 0.2: new column, nullable for now, filled below before being made
-- required. References place_facilities by id in an array, not a plain
-- text array copy, so a facility rename or icon change applies everywhere
-- at once, same reasoning place_categories.category_id already applies to
-- a single value, extended here to a list.
alter table public.places
  add column facility_ids uuid[];

-- 0.2: backfill. For each place, map every string already in the old
-- facilities array to its matching place_facilities.id, in order,
-- dropping any string that doesn't match a seeded name (there should be
-- none, all 4 original values were seeded verbatim above). A place with a
-- null or empty old array backfills to an empty array, not null, so
-- downstream code never has to treat "no facilities set" and "facilities
-- is null" as two different states.
update public.places pl
  set facility_ids = coalesce(
    (
      select array_agg(pf.id order by pf.sort_order)
      from unnest(pl.facilities) as old_name
      join public.place_facilities pf on pf.name = old_name
    ),
    '{}'::uuid[]
  )
  where pl.facility_ids is null;

-- 0.2: guard before locking the column down. If any place's old array
-- contained a string that didn't match a seeded facility name, the
-- backfilled count will be short of the original array's length, which
-- this catches by re-checking that every non-empty old entry produced a
-- match, rather than silently dropping an unmatched facility. Stops the
-- migration here rather than guessing, per constraints.md's rule to stop
-- and flag rather than proceed past an incomplete backfill.
do $$
declare
  mismatched_count int;
begin
  select count(*) into mismatched_count
  from public.places
  where coalesce(array_length(facilities, 1), 0) <> coalesce(array_length(facility_ids, 1), 0);

  if mismatched_count > 0 then
    raise exception 'place_facilities backfill incomplete: % places have a facility_ids count that does not match their old facilities count', mismatched_count;
  end if;
end $$;

-- 0.2: lock the column down and remove the old text[] column now that
-- facility_ids is verified complete for every row. not null with a
-- default of an empty array, matching the "no facilities set" state the
-- backfill above already established for every row.
alter table public.places
  alter column facility_ids set not null,
  alter column facility_ids set default '{}'::uuid[];

alter table public.places
  drop column facilities;
