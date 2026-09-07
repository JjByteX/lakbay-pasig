-- Phase 6.1: Trail credentials. "Users Earned" from data-model.md is left
-- out as a column, it is a count derivable from user_credentials, storing
-- it here would duplicate data that can go stale.
create table public.trail_credentials (
  id uuid primary key default gen_random_uuid(),
  credential_name text not null,
  linked_route_id uuid not null references public.routes(id) on delete cascade,
  requirement_to_earn text
);

-- Phase 6.2: User credentials, join table. Source for cohort stats per
-- competitive-positioning.md, must never be queried or displayed as a
-- per-user ranking, that rule lives in how this table gets read later,
-- not in the schema itself.
create table public.user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credential_id uuid not null references public.trail_credentials(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, credential_id)
);

-- Phase 6.3: Completed routes. Backs trail completion counts on vendor
-- dashboards and cohort messaging like "completed this month," never a
-- per-user leaderboard.
create table public.completed_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  completed_at timestamptz not null default now()
);

-- Phase 6.4: Saved places and saved routes. Two small tables, not one
-- polymorphic table, save targets are only two fixed types, a shared
-- table would need a type column doing the same job with less clarity.
create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique (user_id, place_id)
);

create table public.saved_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique (user_id, route_id)
);

-- Phase 6.5: RLS.
-- trail_credentials is public read, a user needs to see what a credential
-- requires before earning it, e.g. shown on a route's detail page. The
-- other five tables are personal records, readable and writable only by
-- their own user_id, staff has no special access here since this is not
-- review content.

alter table public.trail_credentials enable row level security;

create policy "trail_credentials_select_public"
  on public.trail_credentials for select
  using (true);

create policy "trail_credentials_write_staff"
  on public.trail_credentials for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'build_trails' = any(p.system_permission))
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.staff_role = 'admin' or 'build_trails' = any(p.system_permission))
    )
  );

alter table public.user_credentials enable row level security;

create policy "user_credentials_own"
  on public.user_credentials for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.completed_routes enable row level security;

create policy "completed_routes_own"
  on public.completed_routes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.saved_places enable row level security;

create policy "saved_places_own"
  on public.saved_places for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.saved_routes enable row level security;

create policy "saved_routes_own"
  on public.saved_routes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
