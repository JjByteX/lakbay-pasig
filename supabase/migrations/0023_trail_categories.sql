-- Category Directory, Phase 0.2 (category-directory-phases.md). Same
-- pattern as 0022's place_categories, applied to routes.theme. Renamed
-- Category everywhere per direct instruction, field becomes category_id
-- to match places and events rather than staying theme_id.
--
-- Difference from 0022: routes.theme has no not null constraint (0005),
-- so an existing route can legitimately have no theme set. The backfill
-- guard here allows category_id to stay null when theme was already
-- null, and only raises on a genuine mismatch (a theme value that
-- doesn't match any seeded row), not on a null that was always null.

-- 0.2.1: same shape as place_categories. sort_order for display and
-- picker order, icon for the same Lucide-name-plus-lookup pattern
-- place-category-icons.ts already establishes.
create table public.trail_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 0.2.2: RLS. Public read active rows, no session required, in case a
-- future public trail browsing surface needs this the same way Discover
-- needs place_categories today. Staff write scoped to build_trails or
-- admin, matching routes_write_staff (0005) exactly, since a trail's
-- category is trail content, not a separate permission area.
alter table public.trail_categories enable row level security;

create policy "trail_categories_select_public"
  on public.trail_categories for select
  using (active = true);

create policy "trail_categories_select_staff"
  on public.trail_categories for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'build_trails' = any(p.system_permission))
    )
  );

create policy "trail_categories_write_staff"
  on public.trail_categories for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'build_trails' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'build_trails' = any(p.system_permission))
    )
  );

-- 0.2.3: seed the 3 existing theme values as rows, same names, so no
-- existing route loses its label. Icon set for Trails not yet confirmed
-- per the plan doc's open item, using a neutral placeholder (map-pin,
-- the same fallback place-category-icons.ts's getCategoryIcon uses for
-- an unmatched value) so this migration isn't blocked on that decision.
-- Update these 3 rows' icon column once the real trail icon set is
-- confirmed, no need to re-run the migration for that, a plain update.
insert into public.trail_categories (name, icon, sort_order) values
  ('heritage walk', 'map-pin', 1),
  ('food crawl', 'map-pin', 2),
  ('cultural tour', 'map-pin', 3);

-- 0.2.4: new column, nullable, matching theme's own nullable state, not
-- forced not null the way places.category_id was, since theme itself was
-- never required.
alter table public.routes
  add column category_id uuid references public.trail_categories(id);

-- 0.2.5: backfill by matching theme text to the new table's name column.
-- A null theme stays a null category_id here, matched implicitly since
-- the join only sets category_id where a name actually matches.
update public.routes r
  set category_id = tc.id
  from public.trail_categories tc
  where r.theme = tc.name;

-- 0.2.6: guard, but unlike 0022's, this only flags a real mismatch: a
-- route with a non-null theme that didn't resolve to a seeded row. A
-- route whose theme was already null is expected and fine, not an error,
-- since theme was never required. If this fires, an unexpected theme
-- value exists outside the original 3 and needs a manual look before
-- re-running.
do $$
declare
  unmatched_count int;
begin
  select count(*) into unmatched_count
  from public.routes
  where theme is not null and category_id is null;
  if unmatched_count > 0 then
    raise exception 'trail_categories backfill incomplete: % routes have a theme with no matching category_id', unmatched_count;
  end if;
end $$;

-- 0.2.7: drop the old text column and its check constraint. category_id
-- stays nullable, matching theme's own optionality, not forced not null.
alter table public.routes
  drop column theme;
