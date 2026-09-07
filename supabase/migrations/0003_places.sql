-- Phase 2.1: Places table.
-- Fields from data-model.md. "Trails Included In" is left out as a column,
-- it is derivable from route_stops once that table exists in phase 4,
-- storing it here would just duplicate data that can go stale.
create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('Heritage Site', 'Museum', 'Monument', 'Church', 'Cultural Site')),
  description text,
  historical_background text,
  historical_significance text,
  year_or_period text,
  source_reference text,
  address text not null,
  latitude double precision,
  longitude double precision,
  operating_hours text,
  entrance_fee text,
  visit_duration text,
  accessibility_info text,
  facilities text[],
  nearby_places text,
  language text check (language in ('English', 'Filipino', 'Both')),
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Phase 2.2: Place photos, historical and current, as rows not array columns,
-- so each photo can carry its own order without a separate index scheme.
create table public.place_photos (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  photo_url text not null,
  photo_type text not null check (photo_type in ('historical', 'current')),
  sort_order int not null default 0
);

-- Phase 2.3: Review audit log. Required by admin-panel-spec.md, the parent
-- table's verification_status and reviewed_by cover current state, this
-- table keeps the full history for accountability.
create table public.place_reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  staff_id uuid not null references public.profiles(id),
  action text not null check (action in ('verify', 'reject')),
  notes text,
  created_at timestamptz not null default now()
);

-- Phase 2.4: RLS on places.
-- Public read on verified places. Staff with manage_places, or any admin,
-- can read, insert, and update every row regardless of status, since they
-- need to see and edit pending entries in their review queue.
alter table public.places enable row level security;

create policy "places_select_public"
  on public.places for select
  using (verification_status = 'verified');

create policy "places_select_staff"
  on public.places for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

create policy "places_insert_staff"
  on public.places for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

create policy "places_update_staff"
  on public.places for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

-- Phase 2.5: RLS on place_photos, follows the parent place's read rule.
alter table public.place_photos enable row level security;

create policy "place_photos_select_public"
  on public.place_photos for select
  using (
    exists (
      select 1 from public.places pl
      where pl.id = place_id and pl.verification_status = 'verified'
    )
  );

create policy "place_photos_select_staff"
  on public.place_photos for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

create policy "place_photos_write_staff"
  on public.place_photos for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

-- Phase 2.5: RLS on place_reviews, staff read only, insert restricted the
-- same way as places itself.
alter table public.place_reviews enable row level security;

create policy "place_reviews_select_staff"
  on public.place_reviews for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );

create policy "place_reviews_insert_staff"
  on public.place_reviews for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'manage_places' = any(p.system_permission))
    )
  );
