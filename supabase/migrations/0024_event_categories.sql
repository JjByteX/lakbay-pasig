-- Category Directory, Phase 0.3 (category-directory-phases.md). Same
-- pattern as 0022 and 0023, applied to events.category.
--
-- Difference from 0022: events.category has no not null constraint
-- (0006), same situation 0023 handled for routes.theme. The backfill
-- guard here allows category_id to stay null when category was already
-- null, and only raises on a genuine mismatch, not on a pre-existing null.

-- 0.3.1: same shape as place_categories and trail_categories.
create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 0.3.2: RLS. Public read active rows, no session required, matching
-- events_select_public's own no-session shape for a published event.
-- Staff write scoped to publish_events or admin, matching
-- events_write_staff (0006) exactly, since an event's category is event
-- content, not a separate permission area.
alter table public.event_categories enable row level security;

create policy "event_categories_select_public"
  on public.event_categories for select
  using (active = true);

create policy "event_categories_select_staff"
  on public.event_categories for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'publish_events' = any(p.system_permission))
    )
  );

create policy "event_categories_write_staff"
  on public.event_categories for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'publish_events' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'publish_events' = any(p.system_permission))
    )
  );

-- 0.3.3: seed the 5 existing category values as rows, same names, so no
-- existing event loses its label. Icon set for Announcements not yet
-- confirmed per the plan doc's open item, using the same neutral
-- placeholder (map-pin) 0023 used for trails, not blocking this
-- migration on that decision. Update these 5 rows' icon column once the
-- real announcement icon set is confirmed, a plain update, no re-run
-- needed.
insert into public.event_categories (name, icon, sort_order) values
  ('workshop', 'map-pin', 1),
  ('festival', 'map-pin', 2),
  ('heritage walk', 'map-pin', 3),
  ('program enrollment', 'map-pin', 4),
  ('general announcement', 'map-pin', 5);

-- 0.3.4: new column, nullable, matching category's own nullable state.
alter table public.events
  add column category_id uuid references public.event_categories(id);

-- 0.3.5: backfill by matching category text to the new table's name
-- column. A null category stays a null category_id, matched implicitly.
update public.events e
  set category_id = ec.id
  from public.event_categories ec
  where e.category = ec.name;

-- 0.3.6: guard, same shape as 0023's: only flags a real mismatch, a
-- non-null category that didn't resolve to a seeded row. A pre-existing
-- null category is expected and fine.
do $$
declare
  unmatched_count int;
begin
  select count(*) into unmatched_count
  from public.events
  where category is not null and category_id is null;
  if unmatched_count > 0 then
    raise exception 'event_categories backfill incomplete: % events have a category with no matching category_id', unmatched_count;
  end if;
end $$;

-- 0.3.7: drop the old text column and its check constraint. category_id
-- stays nullable, matching category's own optionality.
alter table public.events
  drop column category;
