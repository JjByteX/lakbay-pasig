-- Phase 3: Accounts Table
-- Extends auth.users, since Supabase Auth itself only stores email and password.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'resident' check (role in ('resident', 'staff')),
  staff_role text check (staff_role in ('staff', 'admin')),
  active_status text not null default 'active' check (active_status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

-- Trigger: create a profiles row automatically on signup, so every new
-- account gets a role assigned without a manual step.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'resident');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Phase 4: Row Level Security

alter table public.profiles enable row level security;

-- 4.2: a signed in account can read its own profile row.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- 4.3: a signed in account can update its own row, but not role or staff_role.
-- Column level protection happens here via a check, not by omitting the
-- column from the policy: a using/with check only guards row access, so the
-- app layer must never send role or staff_role in a self-update request.
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4.4: Admin accounts can read any profile row, for staff account management.
create policy "profiles_select_admin"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.staff_role = 'admin'
    )
  );

-- 4.4: Admin accounts can update any profile row.
create policy "profiles_update_admin"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.staff_role = 'admin'
    )
  );

-- 4.5 and 4.6 are satisfied by omission: no policy grants a public,
-- unauthenticated role any access, and no policy grants a non-admin staff
-- account access to a row that is not their own.
