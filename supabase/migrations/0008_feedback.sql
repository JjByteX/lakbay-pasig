-- Send Feedback (docs/send-feedback-plan.md, Phase 2).
--
-- Guests and signed-in users send feedback through api/feedback.js only. That
-- endpoint uses the service role, which bypasses row level security, so nothing
-- here lets anon or authenticated insert. Staff with review_feedback (and
-- admins) can read rows, change their status, and read the attachment.

-- 2.1 The new permission. Same pattern as manage_landing and view_reports.
alter table public.profiles drop constraint system_permission_values;
alter table public.profiles add constraint system_permission_values check (
  system_permission is null
  or system_permission <@ array[
    'manage_places', 'review_businesses', 'publish_events',
    'build_trails', 'manage_landing', 'view_reports', 'review_feedback'
  ]::text[]
);

-- 2.2 The feedback table. Length limits live here too, so a bug in the
-- endpoint cannot store an oversized row.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('suggestion', 'problem', 'other')),
  message text not null check (char_length(message) between 5 and 2000),
  email text check (email is null or (char_length(email) <= 254 and email like '%_@_%.__%')),
  user_id uuid references public.profiles (id) on delete set null,
  attachment_path text check (attachment_path is null or char_length(attachment_path) <= 200),
  status text not null default 'new' check (status in ('new', 'in_review', 'resolved')),
  created_at timestamptz not null default now(),
  -- Set when status becomes resolved, cleared if it is reopened. Phase 7
  -- retention counts days from this.
  resolved_at timestamptz
);

create index feedback_status_created_idx on public.feedback (status, created_at desc);
create index feedback_resolved_at_idx on public.feedback (resolved_at) where resolved_at is not null;

create or replace function public.feedback_set_resolved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := now();
  elsif new.status <> 'resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger feedback_resolved_at
  before update of status on public.feedback
  for each row execute function public.feedback_set_resolved_at();

-- 2.5 RLS. No insert or delete policy for anyone: the endpoint writes with the
-- service role, and Phase 7 cleanup runs server side too. Select and update are
-- staff only. Column privileges below narrow update to status.
alter table public.feedback enable row level security;

create policy "feedback_select_staff"
  on public.feedback for select
  using (public.is_admin() or public.has_permission('review_feedback'));

create policy "feedback_update_staff"
  on public.feedback for update
  using (public.is_admin() or public.has_permission('review_feedback'))
  with check (public.is_admin() or public.has_permission('review_feedback'));

-- The default privileges in this schema grant everything to anon and
-- authenticated, so take it back, then give staff back only what they need.
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant update (status) on public.feedback to authenticated;

-- 2.3 Shared rate limit counter. A fixed window per key (for example
-- "ip:1.2.3.4" or "user:<uuid>"). Called only by the endpoint, so serverless
-- instances share one count, unlike the in-memory limiter in api/transcribe.js.
create table public.feedback_rate_limit (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create index feedback_rate_limit_window_idx on public.feedback_rate_limit (window_start);

alter table public.feedback_rate_limit enable row level security;
revoke all on public.feedback_rate_limit from anon, authenticated;

-- Counts this call, then returns true if the key is still within p_limit for
-- the current window. Old windows are swept on the way through.
create or replace function public.feedback_rate_check(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  delete from public.feedback_rate_limit
  where window_start < now() - interval '1 day';

  insert into public.feedback_rate_limit as r (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.feedback_rate_check(text, integer, integer) from public, anon, authenticated;
grant execute on function public.feedback_rate_check(text, integer, integer) to service_role;

-- 2.4 Private attachment bucket. Not public, WebP only (the endpoint always
-- re-encodes), 2 MB ceiling. No insert, update or delete policy: only the
-- service role writes. Staff read through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 2097152, array['image/webp'])
on conflict (id) do nothing;

create policy "feedback_files_select_staff"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'feedback'
    and (public.is_admin() or public.has_permission('review_feedback'))
  );

-- 2.6 Decision: status changes are not written to activity_log. Its action and
-- target_type checks are closed lists, and the row already carries status and
-- resolved_at. Revisit only if the Tourism Office asks for an audit trail.
