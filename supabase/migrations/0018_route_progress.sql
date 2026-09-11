-- Step 7, Phase 0. Human-confirmed per constraints.md's No Silent
-- Overrides rule and architecture-notes.md's never-touch-without-approval
-- list (schema). Logged in decision-log.md.
--
-- Gap: completed_routes (0007) is all-or-nothing, written once at finish.
-- No table tracked which stop a user had reached on a trail started but
-- not finished, so closing the app mid-walk had no way to resume, the
-- next open restarted the sequence from stop one. step-7-trail-plan.md's
-- Schema Change First section calls this out directly and asks for a
-- fix before any Trails UI is built on top of it.
--
-- One row per user per route, same one-row-per-user-per-target shape as
-- saved_places/saved_routes (0007), not a row per unlock event: this
-- table only needs to answer "how far did this user get," not replay a
-- full unlock history, so the highest unlocked stop plus when it was
-- reached is sufficient. highest_unlocked_stop_id references
-- route_stops(id), the same table admin-trail-builder.tsx's persistStops
-- already keeps stable across a stop reorder (architecture-notes.md's
-- Pre-5.4 fix), so a stop reorder after a user has started a trail does
-- not silently invalidate their saved position.
create table public.route_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  highest_unlocked_stop_id uuid not null references public.route_stops(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, route_id)
);

-- RLS: owner-only, same using/with check shape as saved_places_own,
-- saved_routes_own, user_credentials_own, and completed_routes_own
-- (0007). This is a personal record, not review content, staff has no
-- special access here, matching every other table in that same
-- migration.
alter table public.route_progress enable row level security;

create policy "route_progress_own"
  on public.route_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
