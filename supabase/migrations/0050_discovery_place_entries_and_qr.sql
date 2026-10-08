-- Discovery content: place entries and QR unlock. Human-approved plan:
-- docs/discovery-content-plan.md. Logged in decision-log.md.
--
-- 1. route_id becomes optional. A row with no route is a place entry: about
--    one place or business, written once, shown in every published trail
--    that has that place as a stop. A row with a route is a trail note, as
--    before. Every existing row has a route, so nothing is backfilled and
--    every existing row stays a trail note.
--
-- 2. qr_token marks an entry that unlocks by scanning a code at the object.
--    Place entries only: the code belongs to the place, so it is printed once
--    and works in every trail through it. The token is random and made by
--    the app when staff tick the box, never typed.
--
-- 3. entry_unlocks records which entries a visitor has scanned, so a scan
--    survives a reload. Same shape and owner-only policy as route_progress
--    (0018). Left out of log_activity, like every resident-owned table
--    (0037).
--
-- The review trigger (0012) keys on the location, not the route, so it is
-- unchanged. The write policy (0013) already allows manage_places and
-- build_trails, so it is unchanged too.

alter table public.discovery_content
  alter column route_id drop not null;

alter table public.discovery_content
  add column qr_token text unique;

alter table public.discovery_content
  add constraint discovery_content_qr_place_only
  check (qr_token is null or route_id is null);

-- Public read. A trail note stays visible while its trail is published, as
-- before. A place entry is visible while its place or business is a stop in
-- a published trail, so a place's secrets stay reachable only through a
-- trail, never browsable on their own.
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
          where r.status = 'published'
            and rs.stop_type = related_location_type
            and rs.stop_id = related_location_id
        )
      )
    )
  );

create table public.entry_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.discovery_content(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, entry_id)
);

alter table public.entry_unlocks enable row level security;

create policy "entry_unlocks_own"
  on public.entry_unlocks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
