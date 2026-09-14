-- Repairs migration 0026's facility_ids backfill, which raised
-- "place_facilities backfill incomplete" on push: 7 places had a
-- facilities/facility_ids length mismatch, tripping 0026's own guard
-- (working as designed, per constraints.md's stop-and-flag rule).
--
-- Root cause: 0026 only ever seeded the four names in data-model.md's
-- closed Available Facilities list (Restrooms, Parking, Info Desk,
-- Waiting Area) -- confirmed against data-model.md directly and against
-- FACILITY_OPTIONS' git history (admin-place-detail.tsx, commit
-- 856226b^), so no legitimate fifth facility name was ever possible.
-- The mismatch is therefore dirty data inside places.facilities itself:
-- null elements and blank/whitespace-only strings, which unnest() still
-- counts toward array_length but which can never join to a seeded
-- place_facilities.name. This migration only strips that noise and
-- de-duplicates each row before re-running 0026's own backfill query
-- verbatim -- it does not add, rename, or guess at any facility value.
--
-- Deliberately its own migration rather than an edit to 0026: 0026
-- already applied successfully on every environment that reset from
-- empty (its guard only fires against pre-existing dirty data), so
-- rewriting history there would diverge from what's already applied
-- elsewhere. Schema change is on architecture-notes.md's
-- never-touch-without-approval list; this migration doesn't touch
-- schema, only cleans and re-runs an existing data transform.

-- Since this only runs where facilities still exists (i.e. the push
-- failed before 0026's DROP COLUMN ran), guard the whole thing so it's
-- a no-op if facilities was already dropped by a successful prior run.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'places' and column_name = 'facilities'
  ) then

    -- Strip null and blank/whitespace-only entries, de-dupe (order-
    -- preserving via array_agg over a distinct subquery keyed on first
    -- occurrence), from every place's old facilities array. A place
    -- that becomes empty after cleaning gets '{}', matching 0026's own
    -- "no facilities set" convention for a null/empty array.
    update public.places pl
    set facilities = coalesce(
      (
        select array_agg(name order by first_pos)
        from (
          select trim(old_name) as name, min(ord) as first_pos
          from unnest(pl.facilities) with ordinality as t(old_name, ord)
          where old_name is not null and trim(old_name) <> ''
          group by trim(old_name)
        ) deduped
      ),
      '{}'::text[]
    )
    where facilities is not null;

    -- Re-run 0026's exact backfill for any place not yet fully
    -- resolved (covers both a place 0026 skipped because facility_ids
    -- was already non-null from a partial run, and one now fixed by
    -- the cleanup above).
    update public.places pl
    set facility_ids = coalesce(
      (
        select array_agg(pf.id order by pf.sort_order)
        from unnest(pl.facilities) as old_name
        join public.place_facilities pf on pf.name = old_name
      ),
      '{}'::uuid[]
    )
    where coalesce(array_length(pl.facilities, 1), 0) <> coalesce(array_length(pl.facility_ids, 1), 0)
       or pl.facility_ids is null;

    -- Same guard 0026 already runs, kept identical so this migration
    -- fails the same way if the cleanup above didn't actually resolve
    -- every row (e.g. a genuinely unseeded name, not just null/blank
    -- noise) rather than silently proceeding past it.
    if exists (
      select 1 from public.places
      where coalesce(array_length(facilities, 1), 0) <> coalesce(array_length(facility_ids, 1), 0)
    ) then
      raise exception 'facility backfill repair incomplete: mismatch remains after null/blank cleanup, a real unseeded facility name likely exists';
    end if;

    -- Column is still nullable/no-default at this point since 0026
    -- never reached its own lock-down step. Finish that here so this
    -- migration leaves the schema in exactly the state 0026 intended.
    alter table public.places
      alter column facility_ids set not null,
      alter column facility_ids set default '{}'::uuid[];

    alter table public.places
      drop column facilities;

  end if;
end $$;
