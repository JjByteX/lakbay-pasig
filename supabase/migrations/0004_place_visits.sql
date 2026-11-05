-- Visit log for seasonality (docs/seasonal-visits-plan.md, Phase 1).
--
-- One row per verified visit: a stop opened by GPS (route_progress moves to a
-- later stop) or an object's QR code scanned (entry_unlocks gets a new row).
-- Only the place or business and the time are stored. No user id, no clicks,
-- no views, no location. The rows are never edited or shown to the public and
-- feed nothing in the app yet; the nightly seasonality job is Phase 2.
--
-- The app code does not change. Both writes already reach the database, even
-- the offline queue (it replays them), so two triggers record the visit.

create table if not exists public.place_visits (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('place', 'business')),
  item_id uuid not null,
  visited_at timestamptz not null default now()
);

create index if not exists place_visits_item_idx
  on public.place_visits (kind, item_id, visited_at);

-- Append-only: with no insert, update or delete policy, only the triggers below
-- (security definer) can write. Admins can read for the Tourism Office view.
alter table public.place_visits enable row level security;

create policy "place_visits_select_admin"
  on public.place_visits for select
  using (public.is_admin());

-- QR scan. Fires only when entry_unlocks really gets a new row, so scanning the
-- same code again (an upsert onto the existing row) is not counted twice.
create or replace function public.log_visit_from_unlock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.place_visits (kind, item_id, visited_at)
  select dc.related_location_type, dc.related_location_id, new.unlocked_at
  from public.discovery_content dc
  where dc.id = new.entry_id;
  return new;
end;
$$;

drop trigger if exists entry_unlocks_log_visit on public.entry_unlocks;
create trigger entry_unlocks_log_visit
  after insert on public.entry_unlocks
  for each row execute function public.log_visit_from_unlock();

-- GPS stop unlock. Fires only when route_progress moves to a different stop, so
-- a repeated write for the same stop is not counted twice. Start creates the
-- row (an insert, not an update), so it is not counted.
create or replace function public.log_visit_from_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.place_visits (kind, item_id, visited_at)
  select rs.stop_type, rs.stop_id, new.unlocked_at
  from public.route_stops rs
  where rs.id = new.highest_unlocked_stop_id;
  return new;
end;
$$;

drop trigger if exists route_progress_log_visit on public.route_progress;
create trigger route_progress_log_visit
  after update of highest_unlocked_stop_id on public.route_progress
  for each row
  when (old.highest_unlocked_stop_id is distinct from new.highest_unlocked_stop_id)
  execute function public.log_visit_from_progress();
