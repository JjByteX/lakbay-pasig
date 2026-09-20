-- Activity log. Human-confirmed per constraints.md's No Silent Overrides
-- rule and architecture-notes.md's never-touch-without-approval list
-- (schema, RLS). Logged in decision-log.md entry #19. Full design in
-- activity-log-plan.md, built per activity-log-phases.md.
--
-- Admin-only, append-only record of staff and admin activity: sign in,
-- sign out, and every content action (create, edit, delete, verify,
-- reject, feature, publish, and the rest of the closed action list).
-- Staff never see this table -- place_reviews/business_reviews stay the
-- per-record review history they already are, this is a separate,
-- cross-table feed for Admin oversight only.
--
-- Built in the phases below, each phase's own comment marks where it
-- starts. Old migrations (0001-0036) are never touched.
--
-- Phase 1: table, check constraints, index, RLS (admin-only select, no
--   write policy for anyone).
-- Phase 2: write_activity() helper (definer, actor lookup, 60s update
--   merge), three trigger functions (log_activity, log_activity_child,
--   log_review_activity), triggers attached to every table in the plan's
--   "What Gets Logged" list, and the log_auth_event RPC for sign in/out.

-- Phase 1.1: table. actor_name/actor_role are copied at write time rather
-- than joined from profiles at read time, so a later rename or role change
-- doesn't rewrite history, and a deleted account's rows stay readable
-- (actor_id set null, actor_name/actor_role stay as they were). target_id
-- carries no foreign key, same app-layer-enforced shape as route_stops/
-- discovery_content's own type-plus-id pattern (architecture-notes.md's
-- Known Fragile Areas), since target_type can point at any one of several
-- tables.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id uuid,
  target_label text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Phase 1.2: closed lists. A typo in a trigger's action/target_type
-- argument fails the insert immediately instead of silently landing an
-- uninterpretable row the admin UI's label maps don't recognize.
alter table public.activity_log
  add constraint activity_log_actor_role_check check (actor_role in ('staff', 'admin'));

alter table public.activity_log
  add constraint activity_log_action_check check (action in (
    'signed_in', 'signed_out',
    'created', 'updated', 'deleted',
    'verified', 'rejected',
    'featured', 'unfeatured',
    'published', 'unpublished',
    'activated', 'deactivated',
    'role_changed', 'permission_changed',
    'staff_created'
  ));

alter table public.activity_log
  add constraint activity_log_target_type_check check (target_type in (
    'place', 'business', 'event', 'trail',
    'discovery_content', 'landing_slide',
    'place_category', 'trail_category', 'event_category', 'business_category', 'place_facility',
    'staff', 'auth'
  ));

-- Phase 1.3: the admin page's only sort is newest-first (admin-panel-spec.md,
-- activity-log-plan.md's UI section), so this is the one index the table
-- needs.
create index activity_log_created_at_idx on public.activity_log (created_at desc);

-- Phase 1.4/1.5: RLS. Admin-only read, same inline exists-on-profiles shape
-- as 0003's places_select_staff, narrowed to the admin branch alone --
-- Staff read nothing, per admin-panel-spec.md's Staff section being
-- "Limited to Admin role only." No insert/update/delete policy exists for
-- anyone: writes only ever happen through write_activity() (Phase 2),
-- which is security definer and bypasses RLS entirely, so this table needs
-- no write policy to serve its own writers. The explicit revoke/grant
-- below is a second, independent lock on top of RLS: even a future policy
-- added here by mistake couldn't let `authenticated` or `anon` write
-- directly, since the privilege itself is gone at the grant level.
alter table public.activity_log enable row level security;

create policy "activity_log_select_admin"
  on public.activity_log for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and p.staff_role = 'admin'
    )
  );

revoke all on public.activity_log from anon;
revoke insert, update, delete, truncate on public.activity_log from authenticated;

-- Phase 2.1: write_activity(). Shared insert logic every trigger and the
-- auth RPC route through, so the actor lookup and the 60-second merge rule
-- live in exactly one place. Definer, same header shape as 0009/0010/0012 --
-- security definer plus a pinned search_path so the function can't be
-- tricked by a caller-controlled search_path, and so it can write to
-- activity_log despite that table having no insert grant for anyone else.
--
-- Actor resolution: auth.uid() joined to profiles, staff_role is not null
-- (excludes residents/vendors entirely, since those accounts only ever
-- have staff_role = null) and active_status = 'active' (excludes a
-- deactivated or the seed's inactive staff.events account). Anything that
-- doesn't match writes nothing and returns silently -- this is also what
-- makes seed.sql's data loads produce zero rows: the seed script runs as
-- the postgres superuser via the CLI's own seed step, so auth.uid() is
-- null there and every call falls through this same branch.
--
-- The 60-second merge only applies to the 'updated' action: a second edit
-- to the same record by the same actor inside 60 seconds of their last
-- 'updated' row for that exact target adds nothing new, rather than
-- letting a burst of small saves (e.g. autosave, or several field edits
-- one after another) turn into a wall of near-identical rows. created,
-- deleted, and every status-flip action are exempt, since each of those
-- is already a single, deliberate action per user gesture, not a save
-- that can legitimately repeat within a minute.
create function public.write_activity(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_target_label text,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_actor_role text;
begin
  select p.id, coalesce(p.display_name, initcap(p.staff_role)), p.staff_role
    into v_actor_id, v_actor_name, v_actor_role
  from public.profiles p
  where p.id = auth.uid()
    and p.staff_role is not null
    and p.active_status = 'active';

  if v_actor_id is null then
    return;
  end if;

  if p_action = 'updated' and exists (
    select 1 from public.activity_log
    where actor_id = v_actor_id
      and action = 'updated'
      and target_type = p_target_type
      and target_id is not distinct from p_target_id
      and created_at > now() - interval '60 seconds'
  ) then
    return;
  end if;

  insert into public.activity_log (actor_id, actor_name, actor_role, action, target_type, target_id, target_label, details)
  values (v_actor_id, v_actor_name, v_actor_role, p_action, p_target_type, p_target_id, p_target_label, p_details);
end;
$$;

revoke execute on function public.write_activity(text, text, uuid, text, jsonb) from public, anon, authenticated;

-- Phase 2.2: log_activity(). Attached to every own-record table (places,
-- businesses, events, routes, discovery_content, landing_slides, the five
-- category-shaped tables). Two trigger arguments: the target_type to log
-- under, and the name of the column to read as target_label -- one
-- function body covers every table in this group since they all share
-- the same insert/update/delete shape, only the label column differs.
--
-- Update logic in three steps:
--   a. diff to_jsonb(old) against to_jsonb(new), drop the ignore list --
--      columns that change on their own (updated_at), change on a reorder
--      drag rather than a content edit (sort_order, sequence_order), or
--      are owned by a different logging path entirely (verification_status/
--      reviewed_by/review_notes/verified_at belong to place_reviews/
--      business_reviews per the plan's Ownership section; needs_place_review
--      is 0012's own computed trigger output, not a staff edit;
--      related_route_stop_id is set by app logic pairing a discovery_content
--      row to its stop, not a content change). null, "" and [] compare as
--      equal (see the comment inside the loop), so a save that only turns
--      null into "" is not a change. Nothing left after the ignore list is
--      removed means the update was a no-op from this table's own logging
--      perspective (e.g. only sort_order moved) -- return with no row
--      written.
--   b. one flip map, table.column to action-by-new-value, each entry
--      checked independently so two flip columns changing in the same
--      write (e.g. a staff promotion that also grants a permission) each
--      get their own row, matching the plan's "one row per changed flip
--      column."
--   c. anything left over (no flip column changed) is one 'updated' row
--      covering every changed column. A write that changes both a flip
--      column and an unrelated column still gets the flip row (carrying
--      every changed column in its own details) plus no separate
--      'updated' row for the same write -- v_flip_fired suppresses it.
create function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := tg_argv[0];
  v_label_column text := tg_argv[1];
  v_old jsonb;
  v_new jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_key text;
  v_old_val jsonb;
  v_new_val jsonb;
  v_too_long boolean;
  v_ignore text[] := array[
    'updated_at', 'sort_order', 'sequence_order',
    'verification_status', 'reviewed_by', 'review_notes', 'verified_at',
    'needs_place_review', 'related_route_stop_id'
  ];
  v_label text;
  v_flip_fired boolean := false;
begin
  if tg_op = 'INSERT' then
    execute format('select ($1).%I', v_label_column) into v_label using new;
    perform public.write_activity('created', v_target_type, new.id, v_label, null);
    return new;
  end if;

  if tg_op = 'DELETE' then
    execute format('select ($1).%I', v_label_column) into v_label using old;
    perform public.write_activity('deleted', v_target_type, old.id, v_label, null);
    return old;
  end if;

  -- tg_op = 'UPDATE'
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  for v_key in select jsonb_object_keys(v_new)
  loop
    if v_key = any(v_ignore) then
      continue;
    end if;
    v_old_val := v_old -> v_key;
    v_new_val := v_new -> v_key;
    -- Empty is empty: to_jsonb() gives a SQL NULL column as JSON null, but
    -- admin-place-detail.tsx hydrates every null text field as "" and saves
    -- {...form} back, and staff-form-dialog.tsx hydrates a null
    -- system_permission as [] and always sends it. Left as a raw jsonb
    -- compare, opening a record and clicking Save with no edits would log
    -- an 'updated' row of null-to-"" noise (and a false permission_changed
    -- on every re-save of a seeded admin). null, "", and [] all read as no
    -- value here, so only a real change survives. nullif on the text form
    -- collapses all three to SQL NULL in one step.
    if nullif(nullif(v_old_val #>> '{}', ''), '[]') is distinct from nullif(nullif(v_new_val #>> '{}', ''), '[]') then
      -- Details Shape (plan): from and to are null when EITHER value is
      -- over 120 characters, both together, never one alone. That is what
      -- keeps the log readable: a null on one side only can then mean
      -- exactly one thing (the field was empty, or was cleared), while
      -- both null means "changed, text too long to keep". Blanking each
      -- side on its own would make a long description shortened to a short
      -- one read as "empty to short", and a short one grown past 120
      -- characters read as "short to empty", i.e. cleared. length() of a
      -- JSON null is SQL NULL, and null > 120 is null, so a null side
      -- never counts as too long by itself.
      v_too_long := length(v_old_val #>> '{}') > 120 or length(v_new_val #>> '{}') > 120;
      v_changed := v_changed || jsonb_build_object(
        v_key,
        jsonb_build_object(
          'from', case when v_too_long then null else v_old_val end,
          'to', case when v_too_long then null else v_new_val end
        )
      );
    end if;
  end loop;

  if v_changed = '{}'::jsonb then
    return new;
  end if;

  execute format('select ($1).%I', v_label_column) into v_label using new;

  -- Flip map: table.column to action-by-new-value. Each entry independent
  -- (not elsif), so a write changing two flip columns at once gets one row
  -- per changed flip column.
  if tg_table_name = 'events' and v_changed ? 'published' then
    perform public.write_activity(
      case when (v_new ->> 'published')::boolean then 'published' else 'unpublished' end,
      v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed)
    );
    v_flip_fired := true;
  end if;

  if tg_table_name = 'routes' and v_changed ? 'status' then
    perform public.write_activity(
      case when v_new ->> 'status' = 'published' then 'published' else 'unpublished' end,
      v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed)
    );
    v_flip_fired := true;
  end if;

  if tg_table_name = 'businesses' and v_changed ? 'featured_status' then
    perform public.write_activity(
      case when v_new ->> 'featured_status' = 'featured' then 'featured' else 'unfeatured' end,
      v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed)
    );
    v_flip_fired := true;
  end if;

  if tg_table_name = 'profiles' and v_changed ? 'active_status' then
    perform public.write_activity(
      case when v_new ->> 'active_status' = 'active' then 'activated' else 'deactivated' end,
      v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed)
    );
    v_flip_fired := true;
  end if;

  if tg_table_name = 'profiles' and v_changed ? 'staff_role' then
    perform public.write_activity('role_changed', v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed));
    v_flip_fired := true;
  end if;

  if tg_table_name = 'profiles' and v_changed ? 'system_permission' then
    perform public.write_activity('permission_changed', v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed));
    v_flip_fired := true;
  end if;

  if tg_table_name = 'discovery_content' and v_changed ? 'status' then
    perform public.write_activity(
      case when v_new ->> 'status' = 'active' then 'activated' else 'deactivated' end,
      v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed)
    );
    v_flip_fired := true;
  end if;

  if tg_table_name in ('landing_slides', 'place_categories', 'trail_categories', 'event_categories', 'business_categories', 'place_facilities')
     and v_changed ? 'active' then
    perform public.write_activity(
      case when (v_new ->> 'active')::boolean then 'activated' else 'deactivated' end,
      v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed)
    );
    v_flip_fired := true;
  end if;

  if not v_flip_fired then
    perform public.write_activity('updated', v_target_type, new.id, v_label, jsonb_build_object('changed', v_changed));
  end if;

  return new;
end;
$$;

revoke execute on function public.log_activity() from public, anon, authenticated;

-- Phase 2.3: log_activity_child(). place_photos and route_stops have no
-- own-record identity worth logging (nobody thinks of "added a photo" as
-- an event separate from "edited the place"), so both log as an 'updated'
-- row on their parent instead of a row of their own. Insert and delete
-- only, per the plan -- no update trigger exists on either table, so the
-- trail builder's stop reorder (two update passes per stop, offset then
-- final position) never reaches this function and produces zero rows,
-- exactly like the ignore-list sort_order/sequence_order skip in
-- log_activity() achieves for tables that do log updates.
--
-- Two trigger arguments: the parent's target_type ('place' or 'trail'),
-- and the parent FK column name on this child table ('place_id' or
-- 'route_id') -- read dynamically so one function body covers both
-- tables. The parent's own name is looked up fresh at write time, not
-- cached anywhere, since the photo/stop row itself carries no copy of it.
create function public.log_activity_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type text := tg_argv[0];
  v_parent_fk_column text := tg_argv[1];
  v_change_key text := tg_argv[2];
  v_parent_id uuid;
  v_parent_label text;
  v_row record;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  execute format('select ($1).%I', v_parent_fk_column) into v_parent_id using v_row;

  if v_target_type = 'place' then
    select name into v_parent_label from public.places where id = v_parent_id;
  else
    select name into v_parent_label from public.routes where id = v_parent_id;
  end if;

  perform public.write_activity(
    'updated', v_target_type, v_parent_id, v_parent_label,
    jsonb_build_object('changed', jsonb_build_object(v_change_key, null))
  );

  return v_row;
end;
$$;

revoke execute on function public.log_activity_child() from public, anon, authenticated;

-- Phase 2.4: log_review_activity(). place_reviews and business_reviews,
-- insert only -- a review is a log itself, never edited or deleted, so
-- there is no update/delete case to handle. 'verify' maps to 'verified',
-- 'reject' to 'rejected', the note lands in details.notes. business_reviews
-- also allows a 'feature' action (0004's own check constraint) which this
-- function deliberately skips: the businesses.featured_status flip inside
-- log_activity() already logs 'featured'/'unfeatured' with real direction,
-- and business_reviews' own 'feature' action can't tell feature from
-- unfeature apart (both use the same action value), so logging it here
-- too would either lose the direction or double up with the flip's own
-- row for the same click.
--
-- One trigger argument: 'place' for place_reviews (which also covers
-- Trail Content/discovery_content reviews, since 0014 widened
-- reviewed_type to distinguish the two), 'business' for business_reviews.
create function public.log_review_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := tg_argv[0];
  v_action text;
  v_target_type text;
  v_target_id uuid;
  v_label text;
begin
  v_action := case new.action when 'verify' then 'verified' when 'reject' then 'rejected' end;
  if v_action is null then
    return new; -- 'feature' (business_reviews only): the featured_status flip owns it
  end if;

  if v_source = 'place' then
    v_target_type := new.reviewed_type; -- 'place' or 'discovery_content'
    v_target_id := new.reviewed_id;
    if new.reviewed_type = 'place' then
      select name into v_label from public.places where id = new.reviewed_id;
    else
      select title into v_label from public.discovery_content where id = new.reviewed_id;
    end if;
  else
    v_target_type := 'business';
    v_target_id := new.business_id;
    select name into v_label from public.businesses where id = new.business_id;
  end if;

  perform public.write_activity(
    v_action, v_target_type, v_target_id, v_label,
    case when new.notes is not null then jsonb_build_object('notes', new.notes) else null end
  );

  return new;
end;
$$;

revoke execute on function public.log_review_activity() from public, anon, authenticated;

-- Phase 2.5: attach triggers. All 'after', 'for each row', so the row is
-- already committed to its own table before write_activity() reads it via
-- new/old -- matters for log_activity_child()'s parent name lookup, which
-- reads a *different* table (places/routes) than the one the trigger fired
-- on, but not for correctness of new/old themselves either way.

-- log_activity: own-record tables. Argument order is (target_type, label_column).
create trigger activity_log_places
  after insert or update or delete on public.places
  for each row execute function public.log_activity('place', 'name');

create trigger activity_log_businesses
  after insert or update or delete on public.businesses
  for each row execute function public.log_activity('business', 'name');

create trigger activity_log_events
  after insert or update or delete on public.events
  for each row execute function public.log_activity('event', 'title');

create trigger activity_log_routes
  after insert or update or delete on public.routes
  for each row execute function public.log_activity('trail', 'name');

create trigger activity_log_discovery_content
  after insert or update or delete on public.discovery_content
  for each row execute function public.log_activity('discovery_content', 'title');

create trigger activity_log_landing_slides
  after insert or update or delete on public.landing_slides
  for each row execute function public.log_activity('landing_slide', 'caption');

create trigger activity_log_place_categories
  after insert or update or delete on public.place_categories
  for each row execute function public.log_activity('place_category', 'name');

create trigger activity_log_trail_categories
  after insert or update or delete on public.trail_categories
  for each row execute function public.log_activity('trail_category', 'name');

create trigger activity_log_event_categories
  after insert or update or delete on public.event_categories
  for each row execute function public.log_activity('event_category', 'name');

create trigger activity_log_business_categories
  after insert or update or delete on public.business_categories
  for each row execute function public.log_activity('business_category', 'name');

create trigger activity_log_place_facilities
  after insert or update or delete on public.place_facilities
  for each row execute function public.log_activity('place_facility', 'name');

-- profiles: staff rows only. Column list plus WHEN clause are both native
-- Postgres trigger filters (evaluated before the function even runs), so
-- avatar, theme, and font-size-only writes never invoke log_activity() at
-- all, not merely get ignored once inside it. old.staff_role is not null
-- excludes every resident/vendor profile row, which never has a
-- staff_role, from ever firing this trigger -- write_activity()'s own
-- actor check is a second, independent guard on who counts as the actor,
-- this WHEN clause is about which row's edit counts as loggable in the
-- first place.
create trigger activity_log_profiles_staff
  after update of staff_role, system_permission, active_status, position, display_name, contact_number
  on public.profiles
  for each row
  when (old.staff_role is not null)
  execute function public.log_activity('staff', 'display_name');

-- log_activity_child: place_photos, route_stops. Insert and delete only.
-- Arguments: (parent target_type, parent FK column, details.changed key).
create trigger activity_log_place_photos
  after insert or delete on public.place_photos
  for each row execute function public.log_activity_child('place', 'place_id', 'photos');

create trigger activity_log_route_stops
  after insert or delete on public.route_stops
  for each row execute function public.log_activity_child('trail', 'route_id', 'stops');

-- log_review_activity: place_reviews, business_reviews. Insert only.
create trigger activity_log_place_reviews
  after insert on public.place_reviews
  for each row execute function public.log_review_activity('place');

create trigger activity_log_business_reviews
  after insert on public.business_reviews
  for each row execute function public.log_review_activity('business');

-- Not attached, per the plan's "Not Logged" section: business_items,
-- business_photos, business_flags (no staff write screen for any of the
-- three), trail_credentials (no writer anywhere in the app), and every
-- resident-owned table (saved_places, saved_routes, completed_routes,
-- user_credentials, route_progress) -- none of those rows are ever
-- written by a staff or admin actor, so write_activity()'s own actor
-- check would silently no-op on all of them anyway; leaving the trigger
-- off entirely avoids paying the trigger-fire cost on every resident
-- action for no logged result.

-- Phase 2.6: log_auth_event(p_action). Sign in and sign out never touch a
-- row in any table (there's no "sessions" table this app owns), so
-- neither can be captured by a trigger the way every other action in this
-- migration is -- this is the one place the app calls into the logging
-- system directly instead of a database write doing it implicitly.
-- Definer, same actor-resolution and silent-no-op-on-mismatch behavior as
-- write_activity() (which this function is a thin, argument-checked
-- wrapper around) -- a resident or an inactive staff account gets no row,
-- same as every other logged action.
--
-- p_action is checked against exactly two values with an explicit raise,
-- not folded into activity_log's own check constraint: this function is
-- the only caller of write_activity() for the 'auth' target_type, so
-- rejecting a bad argument here, before write_activity() is even called,
-- gives login-form.tsx/auth-context.tsx a real Postgres error to catch
-- instead of a call that appears to succeed but silently wrote nothing.
create function public.log_auth_event(p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action not in ('signed_in', 'signed_out') then
    raise exception 'log_auth_event: p_action must be signed_in or signed_out, got %', p_action;
  end if;

  perform public.write_activity(p_action, 'auth', null, null, null);
end;
$$;

revoke execute on function public.log_auth_event(text) from public, anon;
grant execute on function public.log_auth_event(text) to authenticated;
