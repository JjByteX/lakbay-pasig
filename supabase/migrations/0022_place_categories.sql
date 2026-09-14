-- Place Category Directory, Phase 0. Human-confirmed per constraints.md's
-- No Silent Overrides rule and architecture-notes.md's never-touch-
-- without-approval list (schema). Logged in decision-log.md.
--
-- Gap: places.category was a fixed 5-value check constraint (0003).
-- Adding, renaming, or retiring a category meant a code change and a
-- migration. This table moves that list into data an admin can manage,
-- no redeploy needed. Scope: places only. businesses.category (0004)
-- stays free text, no fixed list, a different purpose per the plan doc,
-- not touched by this migration.

-- 0.1: the category directory itself. sort_order controls display order
-- everywhere the list renders (admin list, place form, Discover filter).
-- icon stores a Lucide icon name (e.g. "landmark"), matched at render
-- time against the fixed shortlist in src/lib/place-categories.ts, not a
-- second table, since the shortlist changing needs a code change either
-- way (Phase 1.2).
create table public.place_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 0.2: RLS. Public read on active rows only, no sign-in required, same
-- no-`to`-clause shape places_select_public (0003) already uses, since
-- the Discover filter and the place submission form both need this list
-- without a session. Write limited to manage_places or admin, matching
-- who already owns Places itself (0003's places_insert_staff /
-- places_update_staff), since categories are place content, not a new
-- content type needing its own permission. No self-reference risk here
-- (this policy queries profiles from place_categories, not from
-- profiles itself), so the plain subquery pattern applies directly,
-- migration 0009's is_admin() fix does not apply, that fix was scoped to
-- profiles' own recursive self-check only.
alter table public.place_categories enable row level security;

create policy "place_categories_select_public"
  on public.place_categories for select
  using (active = true);

create policy "place_categories_select_staff"
  on public.place_categories for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

create policy "place_categories_write_staff"
  on public.place_categories for all
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

-- 0.3: seed the 5 existing values as rows, same names, so no existing
-- place loses its category label. Icons per the plan doc's shortlist,
-- one distinct icon per row (0.6's own no-duplicate check applies to
-- future additions too, not just this seed).
insert into public.place_categories (name, icon, sort_order) values
  ('Heritage Site', 'landmark', 1),
  ('Museum', 'building-2', 2),
  ('Monument', 'flag', 3),
  ('Church', 'church', 4),
  ('Cultural Site', 'palette', 5);

-- 0.4: new column, nullable for now, filled in 0.5 before being made
-- required in 0.7. References place_categories, not a plain text copy,
-- so a category rename or icon change applies everywhere at once.
alter table public.places
  add column category_id uuid references public.place_categories(id);

-- 0.5: backfill by matching each place's existing category text to the
-- new table's name column. All 5 existing values were seeded verbatim in
-- 0.3, so every current place should resolve here with no manual mapping.
update public.places pl
  set category_id = pc.id
  from public.place_categories pc
  where pl.category = pc.name;

-- 0.6: guard before locking the column down. If any place did not match
-- a seeded category (a value outside the original 5, or a data issue),
-- this raises and stops the migration here rather than silently setting
-- category_id not null over an incomplete backfill, per constraints.md's
-- rule to stop and flag rather than guess. If this fires, the unmatched
-- rows need a manual look before this migration can be re-run.
do $$
declare
  unmatched_count int;
begin
  select count(*) into unmatched_count from public.places where category_id is null;
  if unmatched_count > 0 then
    raise exception 'place_categories backfill incomplete: % places have no matching category_id', unmatched_count;
  end if;
end $$;

-- 0.7: lock the column down and remove the old text column and its check
-- constraint now that category_id is verified complete for every row.
alter table public.places
  alter column category_id set not null;

alter table public.places
  drop column category;
