-- Fiestas. Reference data for "Ano yung fiesta sa <barangay>?", not a news
-- item: a fiesta is a permanent record that stays put all year, so it is
-- its own table instead of an events row (events are a newest-first feed,
-- one date_time, manual upcoming/ongoing/past). Human-approved per
-- constraints.md's No Silent Overrides rule and architecture-notes.md's
-- never-touch-without-approval list (schema, RLS). Log it in
-- decision-log.md.
--
-- Deliberate departure from decision #21 (barangay is computed from a pin,
-- never stored): a fiesta belongs to a barangay by definition, not by where
-- a pin falls, and a city-wide or multi-barangay fiesta has no single pin.
-- So fiesta_barangays stores the barangay name. Names are a closed list
-- matching properties.name in public/data/pasig-barangays.geojson, so a typo
-- fails the insert instead of silently never matching. If barangays are ever
-- merged or renamed, add a new migration that swaps the check, never edit
-- this one.
--
-- Recurrence is handled by date_label (free text, e.g. 'February 10' or '3rd
-- Sunday of November'), not a recurrence engine: several fiestas follow
-- rules that move every year, and the answer residents want is the label.
-- A one-off change for a given year goes out as a normal announcement
-- (events), not an edit here.
--
-- Dates, picked the way the Announcements form picks them: a fixed-date
-- fiesta has an optional start_date and an optional end_date (a real date
-- each, so a range can cross a month: April 30 to May 1). The YEAR IS NOT
-- MEANINGFUL and is never shown: a fiesta repeats every year, so the year is
-- only a carrier for the month and day, and the label ("April 17-18") is
-- written from those two dates by the admin form. Every reader keeps showing
-- date_label. A rule-based fiesta leaves both dates empty and types the label.
-- month stays for sorting and grouping, and for rule-based fiestas that have
-- no date; when a start_date is set, month must match it (check below), so
-- the two can never disagree. No time of day: a fiesta is a day or a few,
-- and timed happenings (a Misa Mayor, a procession) are announcements.
--
-- published means CATO confirmed it. Rows loaded from the 2021 City Hall
-- Library list (see the seed file) start unpublished until CATO checks them.
create table public.fiestas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  patron_saint text,
  -- Free text for a fiesta held by a community or subdivision that is not
  -- itself a barangay (e.g. Napico). Optional, alongside or instead of
  -- barangay tags.
  community text,
  month smallint check (month between 1 and 12),
  start_date date,
  end_date date,
  date_label text not null,
  description text,
  history text,
  -- The parish or chapel where it is centered, if it is a listed Place.
  related_place_id uuid references public.places(id) on delete set null,
  source_reference text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A start_date fixes the month. The explicit "is not null" parts matter: a
  -- CHECK treats an unknown result as passing, so without them a start_date
  -- with no month would slip through.
  constraint fiestas_start_date_month_check check (
    start_date is null
    or (month is not null and month = extract(month from start_date)::int)
  ),
  -- An end_date needs a start_date, comes after it, and stays within 31 days
  -- of it: every known fiesta is one to three days, and the cap catches a
  -- mistyped year on the end date that would otherwise save without a word.
  constraint fiestas_end_date_check check (
    end_date is null
    or (
      start_date is not null
      and end_date > start_date
      and end_date - start_date <= 31
    )
  )
);

-- Barangay tags. No rows for a fiesta means city-wide (or community-only),
-- one row is a single barangay, several rows is multi-barangay.
create table public.fiesta_barangays (
  fiesta_id uuid not null references public.fiestas(id) on delete cascade,
  barangay text not null check (barangay in (
    'Bagong Ilog', 'Bagong Katipunan', 'Bambang', 'Buting', 'Caniogan',
    'Dela Paz', 'Kalawaan', 'Kapasigan', 'Kapitolyo', 'Malinao',
    'Manggahan', 'Maybunga', 'Oranbo', 'Palatiw', 'Pinagbuhatan',
    'Pineda', 'Rosario', 'Sagad', 'San Antonio', 'San Joaquin',
    'San Jose', 'San Miguel', 'San Nicolas', 'Santa Cruz', 'Santa Rosa',
    'Santo Tomas', 'Santolan', 'Sumilang', 'Ugong', 'Santa Lucia'
  )),
  primary key (fiesta_id, barangay)
);

-- Lookup by barangay is the main read ("fiestas of Buting"), by month for
-- the grouped list.
create index fiesta_barangays_barangay_idx on public.fiesta_barangays (barangay);
create index fiestas_month_idx on public.fiestas (month);

-- RLS. Same shape as events (0006): public reads published rows, staff with
-- publish_events or the admin role read and write everything including
-- drafts. Fiestas reuse publish_events on purpose: a seventh
-- system_permission would touch the same six sites 0033 and 0043 did.
--
-- As with events, the staff select policy has no published check, so a staff
-- account browsing the public app would get drafts under RLS alone. Every
-- public query must add .eq("published", true) on top, same rule
-- home-query.ts documents for announcements.
alter table public.fiestas enable row level security;
alter table public.fiesta_barangays enable row level security;

create policy "fiestas_select_public"
  on public.fiestas for select
  using (published = true);

create policy "fiestas_select_staff"
  on public.fiestas for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'publish_events' = any(p.system_permission))
    )
  );

create policy "fiestas_write_staff"
  on public.fiestas for all
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

-- A tag is public only while its fiesta is published. The explicit published
-- check is repeated here rather than leaning on the subquery's own RLS, so
-- it holds for a staff caller too.
create policy "fiesta_barangays_select_public"
  on public.fiesta_barangays for select
  using (
    exists (
      select 1 from public.fiestas f
      where f.id = fiesta_barangays.fiesta_id
        and f.published = true
    )
  );

create policy "fiesta_barangays_select_staff"
  on public.fiesta_barangays for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'publish_events' = any(p.system_permission))
    )
  );

create policy "fiesta_barangays_write_staff"
  on public.fiesta_barangays for all
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

-- Same reload 0042 and 0043 end with, so PostgREST sees the new tables
-- without a restart.
notify pgrst, 'reload schema';
