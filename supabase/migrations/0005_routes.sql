-- Phase 4.1: Routes (Trails). status is draft/published, not in
-- data-model.md, added because admin-panel-spec.md's Trails section
-- implies a build-then-publish flow with no second reviewer (Staff who
-- builds a Trail can publish it directly). "Places Included" and
-- "Place Order" from data-model.md are left out as columns, both live in
-- route_stops instead, storing them here would duplicate data that can
-- go stale.
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  theme text check (theme in ('heritage walk', 'food crawl', 'cultural tour')),
  estimated_duration text,
  estimated_budget text,
  recommended_time text,
  run_type text check (run_type in ('CATO guided', 'self guided')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Phase 4.2: Route stops. Sequenced places or businesses within a route.
-- stop_type plus stop_id is a type-plus-id pattern, not a foreign key,
-- since a stop can point at either public.places or public.businesses.
-- No database constraint enforces stop_id resolves to a real row in the
-- matching table, the app layer must guarantee that on write.
create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  stop_type text not null check (stop_type in ('place', 'business')),
  stop_id uuid not null,
  sequence_order int not null,
  unique (route_id, sequence_order)
);

-- Phase 4.3: Discovery content. Only proximity triggered secrets go here,
-- per data-model.md's rule, general background stays on the Place or
-- Business page and is not duplicated here. related_location_type plus
-- related_location_id is the same type-plus-id pattern as route_stops,
-- pointing at either a place or a business, no foreign key enforces it.
-- needs_place_review flags admin-panel-spec.md's Trail Publishing
-- exception: a new historical claim not already tied to a verified Place
-- must route through the Places review queue before the Trail goes live.
create table public.discovery_content (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  title text not null,
  content text not null,
  related_location_type text not null check (related_location_type in ('place', 'business')),
  related_location_id uuid not null,
  related_route_stop_id uuid references public.route_stops(id) on delete set null,
  sequence_order int not null,
  unlock_radius int not null,
  needs_place_review boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

-- Phase 4.4: RLS.
-- Public read is gated on status = 'published' for routes, and on the
-- parent route being published for route_stops and discovery_content,
-- matching the places_select_public / place_photos_select_public pattern
-- from 0003. Staff write access uses build_trails, the same permission
-- name 0007's trail_credentials_write_staff policy already checks for,
-- since both guard the same Trails feature area.

alter table public.routes enable row level security;

create policy "routes_select_public"
  on public.routes for select
  using (status = 'published');

create policy "routes_select_staff"
  on public.routes for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'build_trails' = any(p.system_permission))
    )
  );

create policy "routes_write_staff"
  on public.routes for all
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

alter table public.route_stops enable row level security;

create policy "route_stops_select_public"
  on public.route_stops for select
  using (
    exists (
      select 1 from public.routes r
      where r.id = route_id and r.status = 'published'
    )
  );

create policy "route_stops_select_staff"
  on public.route_stops for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'build_trails' = any(p.system_permission))
    )
  );

create policy "route_stops_write_staff"
  on public.route_stops for all
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

alter table public.discovery_content enable row level security;

create policy "discovery_content_select_public"
  on public.discovery_content for select
  using (
    status = 'active'
    and exists (
      select 1 from public.routes r
      where r.id = route_id and r.status = 'published'
    )
  );

create policy "discovery_content_select_staff"
  on public.discovery_content for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'build_trails' = any(p.system_permission))
    )
  );

create policy "discovery_content_write_staff"
  on public.discovery_content for all
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
