-- Phase 5.1: Events table.
-- Fields from data-model.md. related_place references places only, unlike
-- route_stops or discovery_content, an event's Related Place in the doc
-- never mentions businesses, so a plain nullable foreign key is enough.
-- published is added beyond the doc's field list: admin-panel-spec.md
-- names create, edit, and publish as three separate actions, which only
-- makes sense if a draft state exists before publish. lifecycle_status
-- covers Upcoming, Ongoing, Past, a separate concern from draft-vs-live.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text check (category in ('workshop', 'festival', 'heritage walk', 'program enrollment', 'general announcement')),
  related_program text,
  date_time timestamptz,
  location text,
  related_place_id uuid references public.places(id),
  enrollment_info text,
  posted_by uuid not null references public.profiles(id),
  lifecycle_status text not null default 'upcoming' check (lifecycle_status in ('upcoming', 'ongoing', 'past')),
  published boolean not null default false,
  language text check (language in ('English', 'Filipino', 'Both')),
  updated_at timestamptz not null default now()
);

-- Phase 5.2: RLS on events.
-- Public read on published events only, feeds the Home tab's "what CATO
-- just published or updated" per navigation-and-access-control.md. Staff
-- with publish_events, or admin, read and write every row including drafts.
alter table public.events enable row level security;

create policy "events_select_public"
  on public.events for select
  using (published = true);

create policy "events_select_staff"
  on public.events for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'publish_events' = any(p.system_permission))
    )
  );

create policy "events_write_staff"
  on public.events for all
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
