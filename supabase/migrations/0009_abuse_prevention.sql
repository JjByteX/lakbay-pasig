-- Build-order step 10, abuse prevention (vendor-mode-spec.md, Abuse Prevention).
--
-- Held in the database so a client cannot skip it:
--   1. A signed in account may create 3 listings in 24 hours (rate limit).
--   2. A second listing from the same account is saved, not blocked, and gets a
--      system flag so staff look at it (flagged_by is null on that row).
--   3. Any signed in user may report a listing. One open report per person per
--      listing, 10 reports a day, never their own listing, text kept short.
--      The trigger sets flagged_by and resolved itself, so a client cannot
--      report as someone else or insert an already resolved flag.
-- Inserts with no signed in user (seed.sql, the service role) skip all of it.

-- 1. businesses had no creation time, and the rate limit counts attempts.
alter table public.businesses
  add column if not exists created_at timestamptz not null default now();
update public.businesses set created_at = updated_at;

create index if not exists businesses_submitted_by_created_idx
  on public.businesses (submitted_by, created_at desc);

create or replace function public.businesses_abuse_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> new.submitted_by then
    return new;
  end if;

  if (
    select count(*) from public.businesses
    where submitted_by = new.submitted_by and created_at > now() - interval '24 hours'
  ) >= 3 then
    raise exception 'listing_rate_limited';
  end if;

  return new;
end;
$$;

create trigger businesses_abuse_guard
  before insert on public.businesses
  for each row execute function public.businesses_abuse_guard();

-- 2. Second listing: allowed, flagged. After insert, so the flag can point at
-- the new row. Nested in this trigger, the flag insert skips the report rules
-- below (pg_trigger_depth() is 2 there).
create or replace function public.businesses_flag_second_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.businesses
    where submitted_by = new.submitted_by and id <> new.id
  ) then
    insert into public.business_flags (business_id, flag_reason, flagged_by)
    values (new.id, 'Second listing from the same account', null);
  end if;
  return new;
end;
$$;

create trigger businesses_flag_second_listing
  after insert on public.businesses
  for each row execute function public.businesses_flag_second_listing();

-- 3. Reports. Existing rows are not re-checked (not valid).
alter table public.business_flags
  add constraint business_flags_reason_length
  check (char_length(flag_reason) between 3 and 300) not valid;

create unique index if not exists business_flags_one_open_per_user
  on public.business_flags (business_id, flagged_by)
  where resolved = false and flagged_by is not null;

create index if not exists business_flags_flagged_by_created_idx
  on public.business_flags (flagged_by, created_at desc);

create or replace function public.business_flags_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The system flag from businesses_flag_second_listing, or a write with no
  -- signed in user (service role).
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;

  new.flagged_by := auth.uid();
  new.resolved := false;
  new.flag_reason := btrim(new.flag_reason);

  if char_length(new.flag_reason) not between 3 and 300 then
    raise exception 'report_invalid';
  end if;

  if exists (
    select 1 from public.businesses
    where id = new.business_id and submitted_by = auth.uid()
  ) then
    raise exception 'report_own_listing';
  end if;

  if (
    select count(*) from public.business_flags
    where flagged_by = auth.uid() and created_at > now() - interval '24 hours'
  ) >= 10 then
    raise exception 'report_rate_limited';
  end if;

  return new;
end;
$$;

create trigger business_flags_guard
  before insert on public.business_flags
  for each row execute function public.business_flags_guard();
