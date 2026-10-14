-- Baseline: the schema as it stood after migrations 0001 to 0056, in one file.
--
-- Replaces those 56 migrations. Built from a schema dump of the live Supabase
-- project (public schema), tidied (session settings, platform-owned extensions
-- and OWNER TO lines removed), plus the three things a public-schema dump
-- cannot hold: the auth.users trigger, the content-photos storage bucket and
-- its storage.objects policies. Those three are copied from migrations 0001,
-- 0031, 0033 and 0051, the only places that ever defined them; none was
-- changed or dropped later.
--
-- Not included yet: the storage.objects policies for the avatars bucket. The
-- bucket was made by hand in the dashboard, so no migration ever defined them.
-- Add them here before building a fresh database.
--
-- Reference data the app needs in every environment (categories and facilities,
-- inserted by the old migrations 0022 to 0026, 0032 and 0045) is at the end of
-- this file, in its final state. Backfills from the old migrations (0034, 0035)
-- are left out on purpose: a fresh database has no rows to backfill. Demo
-- accounts and sample content are not here; they live in supabase/seed.sql.

set check_function_bodies = false;

CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION "public"."apply_discovery_review_to_flag"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.reviewed_type = 'discovery_content' then
    perform set_config('lakbay.review_clear', 'on', true);
    update public.discovery_content
    set needs_place_review = (new.action = 'reject')
    where id = new.reviewed_id
      and related_location_type = 'business'
      and needs_place_review is distinct from (new.action = 'reject');
    perform set_config('lakbay.review_clear', 'off', true);
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."compute_discovery_content_needs_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clearing boolean := coalesce(current_setting('lakbay.review_clear', true), '') = 'on';
begin
  if new.related_location_type = 'place' then
    -- related_location_type is 'place' or 'business', enforced by
    -- discovery_content's own check constraint.
    new.needs_place_review := not exists (
      select 1 from public.places
      where id = new.related_location_id
        and verification_status = 'verified'
    );
  elsif tg_op = 'INSERT' then
    new.needs_place_review := true;
  elsif old.related_location_type is distinct from new.related_location_type
     or old.related_location_id is distinct from new.related_location_id
     or old.title is distinct from new.title
     or old.content is distinct from new.content
     or old.photo_url is distinct from new.photo_url
     or old.video_url is distinct from new.video_url then
    new.needs_place_review := true;
  elsif not v_clearing then
    -- Nothing reviewable changed: keep what the database had, whatever the
    -- client sent.
    new.needs_place_review := old.needs_place_review;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."delete_my_account"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_uid
      and (role <> 'resident' or staff_role is not null)
  ) then
    raise exception 'staff_account';
  end if;

  if exists (select 1 from public.businesses where submitted_by = v_uid) then
    raise exception 'has_business';
  end if;

  update public.business_flags set flagged_by = null where flagged_by = v_uid;

  delete from public.routes where personal and created_by = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."enforce_personal_trail_caps"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'routes' then
    if new.personal
       and (select count(*) from public.routes
            where personal and created_by = new.created_by) >= 10 then
      raise exception 'personal_trail_limit';
    end if;
  else
    if tg_op = 'UPDATE' and new.route_id = old.route_id then
      return new;
    end if;
    if coalesce((select personal from public.routes where id = new.route_id), false)
       and (select count(*) from public.route_stops
            where route_id = new.route_id) >= 12 then
      raise exception 'personal_stop_limit';
    end if;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'resident');
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."has_permission"("permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active_status = 'active'
      and permission = any(system_permission)
  );
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and staff_role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION "public"."locations_with_entries"() RETURNS TABLE("location_type" "text", "location_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select distinct dc.related_location_type, dc.related_location_id
  from public.discovery_content dc
  where dc.route_id is null
    and dc.status = 'active'
    and not dc.needs_place_review
    and (
      (dc.related_location_type = 'place' and exists (
        select 1 from public.places p
        where p.id = dc.related_location_id and p.verification_status = 'verified'
      ))
      or
      (dc.related_location_type = 'business' and exists (
        select 1 from public.businesses b
        where b.id = dc.related_location_id and b.verification_status in ('verified', 'pending')
      ))
    );
$$;

CREATE OR REPLACE FUNCTION "public"."log_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;

CREATE OR REPLACE FUNCTION "public"."log_activity_child"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;

CREATE OR REPLACE FUNCTION "public"."log_auth_event"("p_action" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_action not in ('signed_in', 'signed_out') then
    raise exception 'log_auth_event: p_action must be signed_in or signed_out, got %', p_action;
  end if;

  perform public.write_activity(p_action, 'auth', null, null, null);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."log_review_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

CREATE OR REPLACE FUNCTION "public"."rec_open_state"("hours" "text", "at" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  j jsonb;
  mode_txt text;
  local_ts timestamp := at at time zone 'Asia/Manila';
  day_key text := (array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[extract(isodow from local_ts)::int];
  now_min int := extract(hour from local_ts)::int * 60 + extract(minute from local_ts)::int;
  r jsonb;
  open_min int;
  close_min int;
begin
  if hours is null or btrim(hours) = '' then return 'unknown'; end if;
  begin
    j := hours::jsonb;
    if jsonb_typeof(j) is distinct from 'object' or (j ->> 'v') is distinct from '1' then return 'unknown'; end if;
    mode_txt := j ->> 'mode';
    if mode_txt in ('temp_closed', 'perm_closed') then return 'out'; end if;
    if mode_txt is distinct from 'main' then return 'unknown'; end if;
    if jsonb_typeof(j -> 'days' -> day_key) is distinct from 'array' then return 'unknown'; end if;
    for r in select * from jsonb_array_elements(j -> 'days' -> day_key) loop
      open_min := split_part(r ->> 0, ':', 1)::int * 60 + split_part(r ->> 0, ':', 2)::int;
      close_min := split_part(r ->> 1, ':', 1)::int * 60 + split_part(r ->> 1, ':', 2)::int;
      if open_min is null or close_min is null then return 'unknown'; end if;
      if now_min >= open_min and now_min < close_min then return 'open'; end if;
    end loop;
    return 'shut';
  exception when others then
    return 'unknown';
  end;
end
$$;

CREATE OR REPLACE FUNCTION "public"."recommend_items"("lat" double precision DEFAULT NULL::double precision, "lng" double precision DEFAULT NULL::double precision, "lim" integer DEFAULT 12, "anchor_kind" "text" DEFAULT NULL::"text", "anchor_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("kind" "text", "id" "uuid", "reason" "text", "distance_km" double precision)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
#variable_conflict use_column
declare
  -- Weights and sizes. Taste sets the coarse order, distance the next, open now
  -- is smallest. pref_pts equals step_pts so a preferred category always lifts
  -- an item at least one step inside its band.
  taste_bands int := 4;           -- rank bands across candidates
  taste_band_pts int := 48;       -- points per band step above the lowest
  taste_missing_pts int := 72;    -- no embedding yet: neutral, the middle of the range
  pref_pts int := 6;              -- item's category is in own preferred_categories
  open_pts int := 12;             -- open now (unknown gets half, shut gets none)
  dist_pts double precision := 36;-- points at distance zero
  -- Distance decay: points * exp(-km / scale). 8 km, not 2: with 2 km, items 1 to 2 km
  -- apart fell into different steps and the same few nearest items won every day
  -- (supabase/recommend_check.sql 2.19 and 2.20 failed on the fixtures). At 8 km
  -- the whole neighbourhood shares a step or two and still ranks a 6 km item below a
  -- 200 m one. Kept in Phase 4: distance does not depend on the vectors.
  dist_scale_km double precision := 8;
  step_pts int := 6;              -- points are cut into steps of this size
  cap_per_category int := 3;
  nearby_km double precision := 10;    -- nearest item farther than this: location is unusable
  similar_min_band int := 2;      -- bands at or above this may say "Similar to"

  uid uuid := auth.uid();
  anchored boolean := anchor_kind is not null and anchor_id is not null;
  -- 0048: the point distance is measured from. The caller for a normal row, the
  -- anchor's own pin for a Similar row (set in the body, null when the anchor
  -- has no pin).
  clat double precision := lat;
  clng double precision := lng;
  now_ts timestamptz;
  day_txt text;
  prefs text[];
begin
  lim := least(30, greatest(1, coalesce(lim, 12)));

  -- Test hook: the clock comes from app.rec_now when set (empty or bad values
  -- fall back to now()), so supabase/recommend_check.sql can pin time.
  begin
    now_ts := coalesce(nullif(current_setting('app.rec_now', true), '')::timestamptz, now());
  exception when others then
    now_ts := now();
  end;
  day_txt := to_char(now_ts at time zone 'Asia/Manila', 'YYYY-MM-DD');

  -- Never reads views_count, saves_count, business_flags, registered_or_informal,
  -- photo rows, description length or listing completeness. Do not add them.
  if uid is not null and not anchored then
    select p.preferred_categories into prefs from public.profiles p where p.id = uid;
  end if;

  -- 0048: a Similar row is about the page item, so "nearby" means near that
  -- item, not near the person. The caller's lat and lng are ignored in anchor
  -- mode. An anchor with no pin, or one the caller cannot read, leaves the
  -- centre null: no distance term, taste and the daily rotation decide.
  if anchored then
    select x.la, x.lo into clat, clng
    from (
      select pl.latitude as la, pl.longitude as lo from public.places pl
      where anchor_kind = 'place' and pl.id = anchor_id
      union all
      select b.latitude, b.longitude from public.businesses b
      where anchor_kind = 'business' and b.id = anchor_id
    ) x
    limit 1;
  end if;

  return query
  with
  cand as (
    select 'place'::text as k, pl.id as iid, pl.category_id as cid, pc.name as cat,
           pl.latitude as la, pl.longitude as lo,
           public.rec_open_state(pl.operating_hours, now_ts) as st
    from public.places pl
    left join public.place_categories pc on pc.id = pl.category_id
    where pl.verification_status = 'verified'
    union all
    select 'business'::text, b.id, b.category_id, coalesce(bc.name, b.category_text_legacy),
           b.latitude, b.longitude,
           public.rec_open_state(b.opening_hours, now_ts)
    from public.businesses b
    left join public.business_categories bc on bc.id = b.category_id
    where b.verification_status in ('verified', 'pending')
  ),
  -- Eligible: not marked closed, not saved, not hidden, not the anchor.
  elig as (
    select c.*
    from cand c
    where c.st <> 'out'
      and not (anchored and c.k = anchor_kind and c.iid = anchor_id)
      and not exists (
        select 1 from public.saved_places sp
        where sp.user_id = uid and c.k = 'place' and sp.place_id = c.iid)
      and not exists (
        -- 0047: a saved business is left out, like a saved place.
        select 1 from public.saved_businesses sb
        where sb.user_id = uid and c.k = 'business' and sb.business_id = c.iid)
      and not exists (
        select 1 from public.rec_hides h
        where h.user_id = uid and h.kind = c.k and h.item_id = c.iid)
  ),
  -- Haversine km from the centre (the caller, or the anchor's pin in anchor
  -- mode, 0048) to each pinned item. The box test is a cheap
  -- gate (0.2 degree is about 22 km). An item outside it gets no distance, so
  -- with a usable location it is left out (it would score about zero anyway).
  dist as (
    select e.*, case
      when clat is not null and clng is not null and e.la is not null and e.lo is not null
           and abs(e.la - clat) <= 0.2 and abs(e.lo - clng) <= 0.2
      then 2 * 6371 * asin(least(1, sqrt(
             sin(radians((e.la - clat) / 2)) ^ 2
             + cos(radians(clat)) * cos(radians(e.la)) * sin(radians((e.lo - clng) / 2)) ^ 2)))
      end as d
    from elig e
  ),
  -- The centre is usable when there is one and the nearest eligible item is
  -- within nearby_km (a tourist still outside Pasig gets the rotated fallback
  -- instead). In anchor mode the centre is the anchor's pin, so a visitor's
  -- own position no longer decides this.
  loc as (
    select coalesce(min(d) <= nearby_km, false) as ok from dist
  ),
  pool as (
    select d.*, l.ok as loc_ok
    from dist d cross join loc l
    where (l.ok and d.d is not null) or not l.ok
  ),
  -- What defines taste: the anchor alone, or the caller's own saved places,
  -- saved businesses and completed trail stops. Only items that have an
  -- embedding count.
  src as (
    select s.k, s.iid, e.embedding, n.name
    from (
      select 'place'::text as k, sp.place_id as iid
      from public.saved_places sp
      where not anchored and sp.user_id = uid
      union
      -- 0047: a saved business is a taste source.
      select 'business'::text, sb.business_id
      from public.saved_businesses sb
      where not anchored and sb.user_id = uid
      union
      select rs.stop_type, rs.stop_id
      from public.completed_routes cr
      join public.route_stops rs on rs.route_id = cr.route_id
      where not anchored and cr.user_id = uid
      union
      select anchor_kind, anchor_id where anchored
    ) s
    join public.item_embeddings e on e.kind = s.k and e.item_id = s.iid
    left join lateral (
      select pl.name from public.places pl where s.k = 'place' and pl.id = s.iid
      union all
      select b.name from public.businesses b where s.k = 'business' and b.id = s.iid
    ) n on true
  ),
  tv as (
    select avg(embedding) as v from src
  ),
  sim as (
    select p.*, case when tv.v is not null and em.embedding is not null
                     then 1 - (em.embedding <=> tv.v) end as sim_val,
           tv.v is not null as taste_on
    from pool p
    cross join tv
    left join public.item_embeddings em on em.kind = p.k and em.item_id = p.iid
  ),
  -- Rank bands among the candidates that have a similarity. percent_rank gives
  -- ties the same band, so identical items are never split by order.
  banded as (
    select m.*, case when m.sim_val is not null then
             least(taste_bands - 1, floor(percent_rank() over (
               partition by (m.sim_val is not null) order by m.sim_val) * taste_bands)::int)
           end as band
    from sim m
  ),
  scored as (
    select b.*,
      (case when not b.taste_on then 0
            when b.band is null then taste_missing_pts
            else b.band * taste_band_pts end)
      + (case when coalesce(b.cat = any(prefs), false) then pref_pts else 0 end)
      + (case b.st when 'open' then open_pts when 'unknown' then open_pts / 2 else 0 end)
      + (case when b.loc_ok then round(dist_pts * exp(-b.d / dist_scale_km))::int else 0 end)
      as pts
    from banded b
  ),
  stepped as (
    select sc.*,
      sc.pts / step_pts as stp,
      md5(coalesce(uid::text,
                   'g:' || case when sc.loc_ok then round(clat::numeric, 2)::text || ',' || round(clng::numeric, 2)::text
                                else 'none' end)
          || '|' || day_txt || '|' || sc.k || '|' || sc.iid::text) as rot
    from scored sc
  ),
  capped as (
    select sd.*, row_number() over (
      partition by sd.k, coalesce(sd.cid, sd.iid) order by sd.stp desc, sd.rot) as rn
    from stepped sd
  ),
  picked as (
    select * from capped where rn <= cap_per_category
    order by stp desc, rot
    limit lim
  )
  select p.k, p.iid,
    case
      when not anchored and p.taste_on and p.band >= similar_min_band and cl.name is not null
        then 'Similar to ' || cl.name
      when p.loc_ok and p.st = 'open' then 'Open now'
      when p.loc_ok and anchored then 'Nearby'
      when p.loc_ok then 'Near you'
    end,
    case when p.loc_ok then p.d end
  from picked p
  left join lateral (
    select s2.name from src s2
    where not anchored and p.band is not null
    order by s2.embedding <=> (select em.embedding from public.item_embeddings em
                               where em.kind = p.k and em.item_id = p.iid)
    limit 1
  ) cl on true
  order by p.stp desc, p.rot;
end
$$;

CREATE OR REPLACE FUNCTION "public"."report_fiesta_coverage"() RETURNS TABLE("barangay" "text", "published_count" integer, "draft_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with allowed as (
    select exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.active_status = 'active'
        and (pr.staff_role = 'admin' or 'view_reports' = any(pr.system_permission))
    ) as ok
  )
  select
    ft.barangay,
    (count(*) filter (where f.published))::integer,
    (count(*) filter (where not f.published))::integer
  from public.fiestas f
  left join public.fiesta_barangays ft on ft.fiesta_id = f.id, allowed
  where allowed.ok
  group by ft.barangay;
$$;

CREATE OR REPLACE FUNCTION "public"."report_points"() RETURNS TABLE("kind" "text", "id" "uuid", "latitude" double precision, "longitude" double precision, "verification_status" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with allowed as (
    select exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.active_status = 'active'
        and (pr.staff_role = 'admin' or 'view_reports' = any(pr.system_permission))
    ) as ok
  )
  select 'place'::text, p.id, p.latitude, p.longitude, p.verification_status
  from public.places p
  left join public.place_categories pc on pc.id = p.category_id, allowed
  where allowed.ok
    and p.verification_status in ('pending', 'verified')
    and coalesce(pc.name, '') <> 'Barangay Hall'
  union all
  select 'business'::text, b.id, b.latitude, b.longitude, b.verification_status
  from public.businesses b, allowed
  where allowed.ok
    and b.verification_status in ('pending', 'verified');
$$;

CREATE TABLE IF NOT EXISTS "public"."businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "business_type" "text" NOT NULL,
    "category_text_legacy" "text",
    "description" "text",
    "address" "text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "contact" "text",
    "opening_hours" "text",
    "business_story" "text",
    "unique_specialty" "text",
    "accessibility_info" "text",
    "social_media_links" "text"[],
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "review_notes" "text",
    "featured_status" "text" DEFAULT 'listed'::"text" NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "registered_or_informal" "text",
    "views_count" integer DEFAULT 0 NOT NULL,
    "saves_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_at" timestamp with time zone,
    "category_id" "uuid",
    "rules" "text",
    CONSTRAINT "businesses_business_type_check" CHECK (("business_type" = ANY (ARRAY['Product'::"text", 'Service'::"text", 'Both'::"text"]))),
    CONSTRAINT "businesses_featured_status_check" CHECK (("featured_status" = ANY (ARRAY['listed'::"text", 'featured'::"text"]))),
    CONSTRAINT "businesses_registered_or_informal_check" CHECK (("registered_or_informal" = ANY (ARRAY['registered'::"text", 'informal'::"text"]))),
    CONSTRAINT "businesses_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'unverified'::"text"])))
);

CREATE OR REPLACE FUNCTION "public"."search_businesses"("q" "text", "lim" integer DEFAULT 5) RETURNS SETOF "public"."businesses"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  qn text := public.search_norm(left(q, 100));
begin
  if coalesce(qn, '') = '' then return; end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.2', true);
  return query
    select b.*
    from public.businesses b
    where public.search_norm(b.name) like '%' || qn || '%'
       or (char_length(qn) >= 3
           and qn <% public.search_norm(b.name)
           and (word_similarity(qn, public.search_norm(b.name)) >= 0.5
                or public.search_fuzzy(qn, public.search_norm(b.name))))
    order by public.search_tier(public.search_norm(b.name), qn),
             word_similarity(qn, public.search_norm(b.name)) desc,
             b.name
    limit lim;
end
$$;

CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "related_program" "text",
    "date_time" timestamp with time zone,
    "location" "text",
    "related_place_id" "uuid",
    "enrollment_info" "text",
    "posted_by" "uuid" NOT NULL,
    "lifecycle_status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "published" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_date_time" timestamp with time zone,
    "category_id" "uuid",
    CONSTRAINT "events_lifecycle_status_check" CHECK (("lifecycle_status" = ANY (ARRAY['upcoming'::"text", 'ongoing'::"text", 'past'::"text"])))
);

CREATE OR REPLACE FUNCTION "public"."search_events"("q" "text", "lim" integer DEFAULT 5, "only_published" boolean DEFAULT true) RETURNS SETOF "public"."events"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  qn text := public.search_norm(left(q, 100));
begin
  if coalesce(qn, '') = '' then return; end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.2', true);
  return query
    select e.*
    from public.events e
    where (not only_published or e.published)
      and (public.search_norm(e.title) like '%' || qn || '%'
           or (char_length(qn) >= 3
               and qn <% public.search_norm(e.title)
               and (word_similarity(qn, public.search_norm(e.title)) >= 0.5
                    or public.search_fuzzy(qn, public.search_norm(e.title)))))
    order by public.search_tier(public.search_norm(e.title), qn),
             word_similarity(qn, public.search_norm(e.title)) desc,
             e.title
    limit lim;
end
$$;

CREATE TABLE IF NOT EXISTS "public"."fiestas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "patron_saint" "text",
    "community" "text",
    "month" smallint,
    "start_date" "date",
    "end_date" "date",
    "date_label" "text" NOT NULL,
    "description" "text",
    "history" "text",
    "related_place_id" "uuid",
    "source_reference" "text",
    "published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fiestas_end_date_check" CHECK ((("end_date" IS NULL) OR (("start_date" IS NOT NULL) AND ("end_date" > "start_date") AND (("end_date" - "start_date") <= 31)))),
    CONSTRAINT "fiestas_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "fiestas_start_date_month_check" CHECK ((("start_date" IS NULL) OR (("month" IS NOT NULL) AND ("month" = (EXTRACT(month FROM "start_date"))::integer))))
);

CREATE OR REPLACE FUNCTION "public"."search_fiestas"("q" "text", "lim" integer DEFAULT 5, "only_published" boolean DEFAULT true) RETURNS SETOF "public"."fiestas"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  qn text := public.search_norm(left(q, 100));
begin
  if coalesce(qn, '') = '' then return; end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.2', true);
  return query
    select f.*
    from public.fiestas f
    cross join lateral (
      select public.search_norm(concat_ws(' ',
        f.name,
        f.community,
        f.patron_saint,
        (select string_agg(b.barangay, ' ') from public.fiesta_barangays b where b.fiesta_id = f.id)
      )) as hay
    ) h
    where (not only_published or f.published)
      and (h.hay like '%' || qn || '%'
           or (char_length(qn) >= 3
               and qn <% h.hay
               and (word_similarity(qn, h.hay) >= 0.5
                    or public.search_fuzzy(qn, h.hay))))
    order by public.search_tier(h.hay, qn),
             word_similarity(qn, h.hay) desc,
             f.name
    limit lim;
end
$$;

CREATE OR REPLACE FUNCTION "public"."search_fuzzy"("qn" "text", "nm" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select not exists (
    select 1
    from regexp_split_to_table(qn, ' ') as q(w),
         lateral (select case when char_length(q.w) <= 3 then 0
                              when char_length(q.w) = 4 then 1
                              else 2 end as d) m
    where position(q.w in nm) = 0
      and not exists (
        select 1
        from regexp_split_to_table(nm, ' ') as x(w)
        where levenshtein_less_equal(left(q.w, 40), left(x.w, 40), m.d) <= m.d
      )
  )
$$;

CREATE TABLE IF NOT EXISTS "public"."business_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric
);

CREATE OR REPLACE FUNCTION "public"."search_items"("q" "text", "lim" integer DEFAULT 4) RETURNS SETOF "public"."business_items"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  qn text := public.search_norm(left(q, 100));
begin
  if coalesce(qn, '') = '' then return; end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.2', true);
  return query
    select i.*
    from public.business_items i
    where exists (
            select 1 from public.businesses b
            where b.id = i.business_id and b.verification_status in ('verified', 'pending')
          )
      and (public.search_norm(i.name) like '%' || qn || '%'
           or (char_length(qn) >= 3
               and qn <% public.search_norm(i.name)
               and (word_similarity(qn, public.search_norm(i.name)) >= 0.5
                    or public.search_fuzzy(qn, public.search_norm(i.name)))))
    order by public.search_tier(public.search_norm(i.name), qn),
             word_similarity(qn, public.search_norm(i.name)) desc,
             i.name,
             i.price asc nulls last
    limit lim;
end
$$;

CREATE OR REPLACE FUNCTION "public"."search_norm"("t" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
  select btrim(regexp_replace(
    translate(lower(t), 'áàâäãåéèêëíìîïóòôöõúùûüñç''’', 'aaaaaaeeeeiiiiooooouuuunc'),
    '[^[:alnum:]]+', ' ', 'g'))
$$;

CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "historical_background" "text",
    "historical_significance" "text",
    "year_or_period" "text",
    "source_reference" "text",
    "address" "text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "operating_hours" "text",
    "entrance_fee" numeric,
    "visit_duration" "text",
    "accessibility_info" "text",
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_at" timestamp with time zone,
    "category_id" "uuid" NOT NULL,
    "facility_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "rules" "text",
    CONSTRAINT "places_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text"])))
);

CREATE OR REPLACE FUNCTION "public"."search_places"("q" "text", "lim" integer DEFAULT 5) RETURNS SETOF "public"."places"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  qn text := public.search_norm(left(q, 100));
begin
  if coalesce(qn, '') = '' then return; end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.2', true);
  return query
    select p.*
    from public.places p
    where public.search_norm(p.name) like '%' || qn || '%'
       or (char_length(qn) >= 3
           and qn <% public.search_norm(p.name)
           and (word_similarity(qn, public.search_norm(p.name)) >= 0.5
                or public.search_fuzzy(qn, public.search_norm(p.name))))
    order by public.search_tier(public.search_norm(p.name), qn),
             word_similarity(qn, public.search_norm(p.name)) desc,
             p.name
    limit lim;
end
$$;

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'resident'::"text" NOT NULL,
    "staff_role" "text",
    "active_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text",
    "contact_number" "text",
    "date_of_birth" "date",
    "preferred_categories" "text"[],
    "position" "text",
    "system_permission" "text"[],
    "theme_preference" "text",
    "font_size_preference" "text",
    "profile_picture" "text",
    "username" "text",
    "first_name" "text",
    "last_name" "text",
    CONSTRAINT "profiles_active_status_check" CHECK (("active_status" = ANY (ARRAY['active'::"text", 'inactive'::"text"]))),
    CONSTRAINT "profiles_font_size_preference_check" CHECK ((("font_size_preference" IS NULL) OR ("font_size_preference" = ANY (ARRAY['small'::"text", 'default'::"text", 'large'::"text"])))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['resident'::"text", 'staff'::"text"]))),
    CONSTRAINT "profiles_staff_role_check" CHECK (("staff_role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))),
    CONSTRAINT "profiles_theme_preference_check" CHECK ((("theme_preference" IS NULL) OR ("theme_preference" = ANY (ARRAY['light'::"text", 'dark'::"text"])))),
    CONSTRAINT "system_permission_values" CHECK ((("system_permission" IS NULL) OR ("system_permission" <@ ARRAY['manage_places'::"text", 'review_businesses'::"text", 'publish_events'::"text", 'build_trails'::"text", 'manage_landing'::"text", 'view_reports'::"text"])))
);

CREATE OR REPLACE FUNCTION "public"."search_staff"("q" "text", "lim" integer DEFAULT 5) RETURNS SETOF "public"."profiles"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  qn text := public.search_norm(left(q, 100));
begin
  if coalesce(qn, '') = '' then return; end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.2', true);
  return query
    select p.*
    from public.profiles p
    where p.role = 'staff'
      and (public.search_norm(p.display_name) like '%' || qn || '%'
           or (char_length(qn) >= 3
               and qn <% public.search_norm(p.display_name)
               and (word_similarity(qn, public.search_norm(p.display_name)) >= 0.5
                    or public.search_fuzzy(qn, public.search_norm(p.display_name)))))
    order by public.search_tier(public.search_norm(p.display_name), qn),
             word_similarity(qn, public.search_norm(p.display_name)) desc,
             p.display_name
    limit lim;
end
$$;

CREATE OR REPLACE FUNCTION "public"."search_tier"("n" "text", "qn" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
  select case
    when n = qn then 0
    when n like qn || '%' then 1
    when n like '% ' || qn || '%' then 2
    when n like '%' || qn || '%' then 3
    else 4
  end
$$;

CREATE TABLE IF NOT EXISTS "public"."routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "estimated_duration" "text",
    "estimated_budget" numeric,
    "recommended_time" "text",
    "run_type" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category_id" "uuid",
    "personal" boolean DEFAULT false NOT NULL,
    CONSTRAINT "routes_personal_draft_owned" CHECK (((NOT "personal") OR (("status" = 'draft'::"text") AND ("created_by" IS NOT NULL)))),
    CONSTRAINT "routes_run_type_check" CHECK (("run_type" = ANY (ARRAY['CATO guided'::"text", 'self guided'::"text"]))),
    CONSTRAINT "routes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);

CREATE OR REPLACE FUNCTION "public"."search_trails"("q" "text", "lim" integer DEFAULT 5) RETURNS SETOF "public"."routes"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  qn text := public.search_norm(left(q, 100));
begin
  if coalesce(qn, '') = '' then return; end if;
  perform set_config('pg_trgm.word_similarity_threshold', '0.2', true);
  return query
    select r.*
    from public.routes r
    where public.search_norm(r.name) like '%' || qn || '%'
       or (char_length(qn) >= 3
           and qn <% public.search_norm(r.name)
           and (word_similarity(qn, public.search_norm(r.name)) >= 0.5
                or public.search_fuzzy(qn, public.search_norm(r.name))))
    order by public.search_tier(public.search_norm(r.name), qn),
             word_similarity(qn, public.search_norm(r.name)) desc,
             r.name
    limit lim;
end
$$;

CREATE OR REPLACE FUNCTION "public"."sync_discovery_review_flag"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.discovery_content
  set needs_place_review = (new.verification_status <> 'verified')
  where related_location_type = 'place'
    and related_location_id = new.id
    and needs_place_review is distinct from (new.verification_status <> 'verified');
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."write_activity"("p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_label" "text", "p_details" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_name" "text" NOT NULL,
    "actor_role" "text" NOT NULL,
    "action" "text" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid",
    "target_label" "text",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_log_action_check" CHECK (("action" = ANY (ARRAY['signed_in'::"text", 'signed_out'::"text", 'created'::"text", 'updated'::"text", 'deleted'::"text", 'verified'::"text", 'rejected'::"text", 'featured'::"text", 'unfeatured'::"text", 'published'::"text", 'unpublished'::"text", 'activated'::"text", 'deactivated'::"text", 'role_changed'::"text", 'permission_changed'::"text", 'staff_created'::"text"]))),
    CONSTRAINT "activity_log_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['staff'::"text", 'admin'::"text"]))),
    CONSTRAINT "activity_log_target_type_check" CHECK (("target_type" = ANY (ARRAY['place'::"text", 'business'::"text", 'event'::"text", 'trail'::"text", 'discovery_content'::"text", 'landing_slide'::"text", 'place_category'::"text", 'trail_category'::"text", 'event_category'::"text", 'business_category'::"text", 'place_facility'::"text", 'fiesta'::"text", 'staff'::"text", 'auth'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."business_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "color" "text"
);

CREATE TABLE IF NOT EXISTS "public"."business_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "flag_reason" "text" NOT NULL,
    "flagged_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."business_item_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "photo_url" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."business_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "photo_url" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."business_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_reviews_action_check" CHECK (("action" = ANY (ARRAY['verify'::"text", 'reject'::"text", 'feature'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."completed_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "route_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."discovery_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "related_location_type" "text" NOT NULL,
    "related_location_id" "uuid" NOT NULL,
    "related_route_stop_id" "uuid",
    "sequence_order" integer NOT NULL,
    "unlock_radius" integer NOT NULL,
    "needs_place_review" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "qr_token" "text",
    "photo_url" "text",
    "video_url" "text",
    CONSTRAINT "discovery_content_qr_place_only" CHECK ((("qr_token" IS NULL) OR ("route_id" IS NULL))),
    CONSTRAINT "discovery_content_related_location_type_check" CHECK (("related_location_type" = ANY (ARRAY['place'::"text", 'business'::"text"]))),
    CONSTRAINT "discovery_content_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"]))),
    CONSTRAINT "discovery_content_video_url_provider" CHECK ((("video_url" IS NULL) OR ("video_url" ~* '^https://((www|m|web)\.)?(youtube\.com|facebook\.com)/'::"text") OR ("video_url" ~* '^https://(youtu\.be|fb\.watch)/'::"text")))
);

CREATE TABLE IF NOT EXISTS "public"."entry_unlocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."event_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."fiesta_barangays" (
    "fiesta_id" "uuid" NOT NULL,
    "barangay" "text" NOT NULL,
    CONSTRAINT "fiesta_barangays_barangay_check" CHECK (("barangay" = ANY (ARRAY['Bagong Ilog'::"text", 'Bagong Katipunan'::"text", 'Bambang'::"text", 'Buting'::"text", 'Caniogan'::"text", 'Dela Paz'::"text", 'Kalawaan'::"text", 'Kapasigan'::"text", 'Kapitolyo'::"text", 'Malinao'::"text", 'Manggahan'::"text", 'Maybunga'::"text", 'Oranbo'::"text", 'Palatiw'::"text", 'Pinagbuhatan'::"text", 'Pineda'::"text", 'Rosario'::"text", 'Sagad'::"text", 'San Antonio'::"text", 'San Joaquin'::"text", 'San Jose'::"text", 'San Miguel'::"text", 'San Nicolas'::"text", 'Santa Cruz'::"text", 'Santa Rosa'::"text", 'Santo Tomas'::"text", 'Santolan'::"text", 'Sumilang'::"text", 'Ugong'::"text", 'Santa Lucia'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."item_embeddings" (
    "kind" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "model" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "embedding" "extensions"."vector"(384) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "item_embeddings_kind_check" CHECK (("kind" = ANY (ARRAY['place'::"text", 'business'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."landing_slides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_url" "text" NOT NULL,
    "caption" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."place_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "color" "text"
);

CREATE TABLE IF NOT EXISTS "public"."place_facilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."place_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "place_id" "uuid" NOT NULL,
    "photo_url" "text" NOT NULL,
    "photo_type" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "place_photos_photo_type_check" CHECK (("photo_type" = ANY (ARRAY['historical'::"text", 'current'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."place_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_type" "text" NOT NULL,
    "reviewed_id" "uuid" NOT NULL,
    CONSTRAINT "place_reviews_action_check" CHECK (("action" = ANY (ARRAY['verify'::"text", 'reject'::"text"]))),
    CONSTRAINT "place_reviews_reviewed_type_check" CHECK (("reviewed_type" = ANY (ARRAY['place'::"text", 'discovery_content'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."rec_hides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "hidden_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rec_hides_kind_check" CHECK (("kind" = ANY (ARRAY['place'::"text", 'business'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."route_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "route_id" "uuid" NOT NULL,
    "highest_unlocked_stop_id" "uuid" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."route_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_id" "uuid" NOT NULL,
    "stop_type" "text" NOT NULL,
    "stop_id" "uuid" NOT NULL,
    "sequence_order" integer NOT NULL,
    CONSTRAINT "route_stops_stop_type_check" CHECK (("stop_type" = ANY (ARRAY['place'::"text", 'business'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."saved_businesses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_id" "uuid" NOT NULL,
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."saved_places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "place_id" "uuid" NOT NULL,
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."saved_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "route_id" "uuid" NOT NULL,
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."trail_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."trail_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "credential_name" "text" NOT NULL,
    "linked_route_id" "uuid" NOT NULL,
    "requirement_to_earn" "text"
);

CREATE TABLE IF NOT EXISTS "public"."user_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "credential_id" "uuid" NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."business_categories"
    ADD CONSTRAINT "business_categories_name_key" UNIQUE ("name");

ALTER TABLE ONLY "public"."business_categories"
    ADD CONSTRAINT "business_categories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."business_flags"
    ADD CONSTRAINT "business_flags_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."business_item_photos"
    ADD CONSTRAINT "business_item_photos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."business_items"
    ADD CONSTRAINT "business_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."business_photos"
    ADD CONSTRAINT "business_photos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."completed_routes"
    ADD CONSTRAINT "completed_routes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."discovery_content"
    ADD CONSTRAINT "discovery_content_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."discovery_content"
    ADD CONSTRAINT "discovery_content_qr_token_key" UNIQUE ("qr_token");

ALTER TABLE ONLY "public"."entry_unlocks"
    ADD CONSTRAINT "entry_unlocks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."entry_unlocks"
    ADD CONSTRAINT "entry_unlocks_user_id_entry_id_key" UNIQUE ("user_id", "entry_id");

ALTER TABLE ONLY "public"."event_categories"
    ADD CONSTRAINT "event_categories_name_key" UNIQUE ("name");

ALTER TABLE ONLY "public"."event_categories"
    ADD CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."fiesta_barangays"
    ADD CONSTRAINT "fiesta_barangays_pkey" PRIMARY KEY ("fiesta_id", "barangay");

ALTER TABLE ONLY "public"."fiestas"
    ADD CONSTRAINT "fiestas_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."item_embeddings"
    ADD CONSTRAINT "item_embeddings_pkey" PRIMARY KEY ("kind", "item_id");

ALTER TABLE ONLY "public"."landing_slides"
    ADD CONSTRAINT "landing_slides_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."place_categories"
    ADD CONSTRAINT "place_categories_name_key" UNIQUE ("name");

ALTER TABLE ONLY "public"."place_categories"
    ADD CONSTRAINT "place_categories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."place_facilities"
    ADD CONSTRAINT "place_facilities_name_key" UNIQUE ("name");

ALTER TABLE ONLY "public"."place_facilities"
    ADD CONSTRAINT "place_facilities_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."place_photos"
    ADD CONSTRAINT "place_photos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."place_reviews"
    ADD CONSTRAINT "place_reviews_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."rec_hides"
    ADD CONSTRAINT "rec_hides_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."rec_hides"
    ADD CONSTRAINT "rec_hides_user_id_kind_item_id_key" UNIQUE ("user_id", "kind", "item_id");

ALTER TABLE ONLY "public"."route_progress"
    ADD CONSTRAINT "route_progress_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."route_progress"
    ADD CONSTRAINT "route_progress_user_id_route_id_key" UNIQUE ("user_id", "route_id");

ALTER TABLE ONLY "public"."route_stops"
    ADD CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."route_stops"
    ADD CONSTRAINT "route_stops_route_id_sequence_order_key" UNIQUE ("route_id", "sequence_order");

ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."saved_businesses"
    ADD CONSTRAINT "saved_businesses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."saved_businesses"
    ADD CONSTRAINT "saved_businesses_user_id_business_id_key" UNIQUE ("user_id", "business_id");

ALTER TABLE ONLY "public"."saved_places"
    ADD CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."saved_places"
    ADD CONSTRAINT "saved_places_user_id_place_id_key" UNIQUE ("user_id", "place_id");

ALTER TABLE ONLY "public"."saved_routes"
    ADD CONSTRAINT "saved_routes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."saved_routes"
    ADD CONSTRAINT "saved_routes_user_id_route_id_key" UNIQUE ("user_id", "route_id");

ALTER TABLE ONLY "public"."trail_categories"
    ADD CONSTRAINT "trail_categories_name_key" UNIQUE ("name");

ALTER TABLE ONLY "public"."trail_categories"
    ADD CONSTRAINT "trail_categories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."trail_credentials"
    ADD CONSTRAINT "trail_credentials_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_user_id_credential_id_key" UNIQUE ("user_id", "credential_id");

CREATE INDEX "activity_log_created_at_idx" ON "public"."activity_log" USING "btree" ("created_at" DESC);

CREATE INDEX "business_items_name_trgm" ON "public"."business_items" USING "gin" ("public"."search_norm"("name") "extensions"."gin_trgm_ops");

CREATE INDEX "businesses_name_trgm" ON "public"."businesses" USING "gin" ("public"."search_norm"("name") "extensions"."gin_trgm_ops");

CREATE INDEX "events_title_trgm" ON "public"."events" USING "gin" ("public"."search_norm"("title") "extensions"."gin_trgm_ops");

CREATE INDEX "fiesta_barangays_barangay_idx" ON "public"."fiesta_barangays" USING "btree" ("barangay");

CREATE INDEX "fiestas_month_idx" ON "public"."fiestas" USING "btree" ("month");

CREATE INDEX "places_name_trgm" ON "public"."places" USING "gin" ("public"."search_norm"("name") "extensions"."gin_trgm_ops");

CREATE INDEX "profiles_display_name_trgm" ON "public"."profiles" USING "gin" ("public"."search_norm"("display_name") "extensions"."gin_trgm_ops");

CREATE UNIQUE INDEX "profiles_username_unique" ON "public"."profiles" USING "btree" ("username") WHERE ("username" IS NOT NULL);

CREATE INDEX "routes_name_trgm" ON "public"."routes" USING "gin" ("public"."search_norm"("name") "extensions"."gin_trgm_ops");

CREATE OR REPLACE TRIGGER "activity_log_business_categories" AFTER INSERT OR DELETE OR UPDATE ON "public"."business_categories" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('business_category', 'name');

CREATE OR REPLACE TRIGGER "activity_log_business_reviews" AFTER INSERT ON "public"."business_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."log_review_activity"('business');

CREATE OR REPLACE TRIGGER "activity_log_businesses" AFTER INSERT OR DELETE OR UPDATE ON "public"."businesses" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('business', 'name');

CREATE OR REPLACE TRIGGER "activity_log_discovery_content" AFTER INSERT OR DELETE OR UPDATE ON "public"."discovery_content" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('discovery_content', 'title');

CREATE OR REPLACE TRIGGER "activity_log_event_categories" AFTER INSERT OR DELETE OR UPDATE ON "public"."event_categories" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('event_category', 'name');

CREATE OR REPLACE TRIGGER "activity_log_events" AFTER INSERT OR DELETE OR UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('event', 'title');

CREATE OR REPLACE TRIGGER "activity_log_fiestas" AFTER INSERT OR DELETE OR UPDATE ON "public"."fiestas" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('fiesta', 'name');

CREATE OR REPLACE TRIGGER "activity_log_landing_slides" AFTER INSERT OR DELETE OR UPDATE ON "public"."landing_slides" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('landing_slide', 'caption');

CREATE OR REPLACE TRIGGER "activity_log_place_categories" AFTER INSERT OR DELETE OR UPDATE ON "public"."place_categories" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('place_category', 'name');

CREATE OR REPLACE TRIGGER "activity_log_place_facilities" AFTER INSERT OR DELETE OR UPDATE ON "public"."place_facilities" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('place_facility', 'name');

CREATE OR REPLACE TRIGGER "activity_log_place_photos" AFTER INSERT OR DELETE ON "public"."place_photos" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity_child"('place', 'place_id', 'photos');

CREATE OR REPLACE TRIGGER "activity_log_place_reviews" AFTER INSERT ON "public"."place_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."log_review_activity"('place');

CREATE OR REPLACE TRIGGER "activity_log_places" AFTER INSERT OR DELETE OR UPDATE ON "public"."places" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('place', 'name');

CREATE OR REPLACE TRIGGER "activity_log_profiles_staff" AFTER UPDATE OF "staff_role", "system_permission", "active_status", "position", "display_name", "contact_number" ON "public"."profiles" FOR EACH ROW WHEN (("old"."staff_role" IS NOT NULL)) EXECUTE FUNCTION "public"."log_activity"('staff', 'display_name');

CREATE OR REPLACE TRIGGER "activity_log_route_stops" AFTER INSERT OR DELETE ON "public"."route_stops" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity_child"('trail', 'route_id', 'stops');

CREATE OR REPLACE TRIGGER "activity_log_routes" AFTER INSERT OR DELETE OR UPDATE ON "public"."routes" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('trail', 'name');

CREATE OR REPLACE TRIGGER "activity_log_trail_categories" AFTER INSERT OR DELETE OR UPDATE ON "public"."trail_categories" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"('trail_category', 'name');

CREATE OR REPLACE TRIGGER "discovery_content_set_needs_review" BEFORE INSERT OR UPDATE ON "public"."discovery_content" FOR EACH ROW EXECUTE FUNCTION "public"."compute_discovery_content_needs_review"();

CREATE OR REPLACE TRIGGER "personal_stop_cap" BEFORE INSERT OR UPDATE OF "route_id" ON "public"."route_stops" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_personal_trail_caps"();

CREATE OR REPLACE TRIGGER "personal_trail_cap" BEFORE INSERT ON "public"."routes" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_personal_trail_caps"();

CREATE OR REPLACE TRIGGER "place_reviews_apply_discovery_flag" AFTER INSERT ON "public"."place_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."apply_discovery_review_to_flag"();

CREATE OR REPLACE TRIGGER "places_sync_discovery_review_flag" AFTER UPDATE OF "verification_status" ON "public"."places" FOR EACH ROW WHEN (("old"."verification_status" IS DISTINCT FROM "new"."verification_status")) EXECUTE FUNCTION "public"."sync_discovery_review_flag"();

ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."business_flags"
    ADD CONSTRAINT "business_flags_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."business_flags"
    ADD CONSTRAINT "business_flags_flagged_by_fkey" FOREIGN KEY ("flagged_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."business_item_photos"
    ADD CONSTRAINT "business_item_photos_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."business_items"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."business_items"
    ADD CONSTRAINT "business_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."business_photos"
    ADD CONSTRAINT "business_photos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."business_reviews"
    ADD CONSTRAINT "business_reviews_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."business_categories"("id");

ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."businesses"
    ADD CONSTRAINT "businesses_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."completed_routes"
    ADD CONSTRAINT "completed_routes_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."completed_routes"
    ADD CONSTRAINT "completed_routes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."discovery_content"
    ADD CONSTRAINT "discovery_content_related_route_stop_id_fkey" FOREIGN KEY ("related_route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."discovery_content"
    ADD CONSTRAINT "discovery_content_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."entry_unlocks"
    ADD CONSTRAINT "entry_unlocks_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."discovery_content"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."entry_unlocks"
    ADD CONSTRAINT "entry_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id");

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_related_place_id_fkey" FOREIGN KEY ("related_place_id") REFERENCES "public"."places"("id");

ALTER TABLE ONLY "public"."fiesta_barangays"
    ADD CONSTRAINT "fiesta_barangays_fiesta_id_fkey" FOREIGN KEY ("fiesta_id") REFERENCES "public"."fiestas"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."fiestas"
    ADD CONSTRAINT "fiestas_related_place_id_fkey" FOREIGN KEY ("related_place_id") REFERENCES "public"."places"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."place_photos"
    ADD CONSTRAINT "place_photos_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."place_reviews"
    ADD CONSTRAINT "place_reviews_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."place_categories"("id");

ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."rec_hides"
    ADD CONSTRAINT "rec_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."route_progress"
    ADD CONSTRAINT "route_progress_highest_unlocked_stop_id_fkey" FOREIGN KEY ("highest_unlocked_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."route_progress"
    ADD CONSTRAINT "route_progress_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."route_progress"
    ADD CONSTRAINT "route_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."route_stops"
    ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."trail_categories"("id");

ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."saved_businesses"
    ADD CONSTRAINT "saved_businesses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."saved_businesses"
    ADD CONSTRAINT "saved_businesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."saved_places"
    ADD CONSTRAINT "saved_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."saved_places"
    ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."saved_routes"
    ADD CONSTRAINT "saved_routes_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."saved_routes"
    ADD CONSTRAINT "saved_routes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."trail_credentials"
    ADD CONSTRAINT "trail_credentials_linked_route_id_fkey" FOREIGN KEY ("linked_route_id") REFERENCES "public"."routes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "public"."trail_credentials"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_select_admin" ON "public"."activity_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND ("p"."staff_role" = 'admin'::"text")))));

ALTER TABLE "public"."business_categories" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_categories_select_public" ON "public"."business_categories" FOR SELECT USING (("active" = true));

CREATE POLICY "business_categories_select_staff" ON "public"."business_categories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "business_categories_write_staff" ON "public"."business_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."business_flags" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_flags_insert_any" ON "public"."business_flags" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));

CREATE POLICY "business_flags_select_staff" ON "public"."business_flags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "business_flags_update_staff" ON "public"."business_flags" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."business_item_photos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_item_photos_select_own" ON "public"."business_item_photos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."business_items" "bi"
     JOIN "public"."businesses" "b" ON (("b"."id" = "bi"."business_id")))
  WHERE (("bi"."id" = "business_item_photos"."item_id") AND ("b"."submitted_by" = "auth"."uid"())))));

CREATE POLICY "business_item_photos_select_public" ON "public"."business_item_photos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."business_items" "bi"
     JOIN "public"."businesses" "b" ON (("b"."id" = "bi"."business_id")))
  WHERE (("bi"."id" = "business_item_photos"."item_id") AND ("b"."verification_status" = ANY (ARRAY['verified'::"text", 'pending'::"text"]))))));

CREATE POLICY "business_item_photos_write_own" ON "public"."business_item_photos" USING ((EXISTS ( SELECT 1
   FROM ("public"."business_items" "bi"
     JOIN "public"."businesses" "b" ON (("b"."id" = "bi"."business_id")))
  WHERE (("bi"."id" = "business_item_photos"."item_id") AND ("b"."submitted_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."business_items" "bi"
     JOIN "public"."businesses" "b" ON (("b"."id" = "bi"."business_id")))
  WHERE (("bi"."id" = "business_item_photos"."item_id") AND ("b"."submitted_by" = "auth"."uid"())))));

CREATE POLICY "business_item_photos_write_staff" ON "public"."business_item_photos" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."business_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_items_select_own" ON "public"."business_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_items"."business_id") AND ("b"."submitted_by" = "auth"."uid"())))));

CREATE POLICY "business_items_select_public" ON "public"."business_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_items"."business_id") AND ("b"."verification_status" = ANY (ARRAY['verified'::"text", 'pending'::"text"]))))));

CREATE POLICY "business_items_write_own" ON "public"."business_items" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_items"."business_id") AND ("b"."submitted_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_items"."business_id") AND ("b"."submitted_by" = "auth"."uid"())))));

CREATE POLICY "business_items_write_staff" ON "public"."business_items" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."business_photos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_photos_select_own" ON "public"."business_photos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_photos"."business_id") AND ("b"."submitted_by" = "auth"."uid"())))));

CREATE POLICY "business_photos_select_public" ON "public"."business_photos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_photos"."business_id") AND ("b"."verification_status" = 'verified'::"text")))));

CREATE POLICY "business_photos_write_own" ON "public"."business_photos" USING ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_photos"."business_id") AND ("b"."submitted_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE (("b"."id" = "business_photos"."business_id") AND ("b"."submitted_by" = "auth"."uid"())))));

CREATE POLICY "business_photos_write_staff" ON "public"."business_photos" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."business_reviews" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_reviews_insert_staff" ON "public"."business_reviews" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "business_reviews_select_staff" ON "public"."business_reviews" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('review_businesses'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."businesses" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "businesses_insert_own" ON "public"."businesses" FOR INSERT WITH CHECK (("auth"."uid"() = "submitted_by"));

CREATE POLICY "businesses_select_own" ON "public"."businesses" FOR SELECT USING (("auth"."uid"() = "submitted_by"));

CREATE POLICY "businesses_select_public" ON "public"."businesses" FOR SELECT USING (("verification_status" = ANY (ARRAY['verified'::"text", 'pending'::"text"])));

CREATE POLICY "businesses_select_staff" ON "public"."businesses" FOR SELECT USING (("public"."is_admin"() OR "public"."has_permission"('review_businesses'::"text")));

CREATE POLICY "businesses_update_own" ON "public"."businesses" FOR UPDATE USING (("auth"."uid"() = "submitted_by")) WITH CHECK (("auth"."uid"() = "submitted_by"));

CREATE POLICY "businesses_update_staff" ON "public"."businesses" FOR UPDATE USING (("public"."is_admin"() OR "public"."has_permission"('review_businesses'::"text")));

ALTER TABLE "public"."completed_routes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "completed_routes_official_only" ON "public"."completed_routes" AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "completed_routes"."route_id") AND (NOT "r"."personal")))));

CREATE POLICY "completed_routes_official_only_update" ON "public"."completed_routes" AS RESTRICTIVE FOR UPDATE WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "completed_routes"."route_id") AND (NOT "r"."personal")))));

CREATE POLICY "completed_routes_own" ON "public"."completed_routes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."discovery_content" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discovery_content_select_public" ON "public"."discovery_content" FOR SELECT USING ((("status" = 'active'::"text") AND ((EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "discovery_content"."route_id") AND ("r"."status" = 'published'::"text")))) OR (("route_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."route_stops" "rs"
     JOIN "public"."routes" "r" ON (("r"."id" = "rs"."route_id")))
  WHERE ((("r"."status" = 'published'::"text") OR ("r"."personal" AND ("r"."created_by" = "auth"."uid"()) AND (NOT "discovery_content"."needs_place_review"))) AND ("rs"."stop_type" = "discovery_content"."related_location_type") AND ("rs"."stop_id" = "discovery_content"."related_location_id"))))))));

CREATE POLICY "discovery_content_select_staff" ON "public"."discovery_content" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")) OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "discovery_content_write_staff" ON "public"."discovery_content" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")) OR ('manage_places'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")) OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."entry_unlocks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entry_unlocks_own" ON "public"."entry_unlocks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."event_categories" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_categories_select_public" ON "public"."event_categories" FOR SELECT USING (("active" = true));

CREATE POLICY "event_categories_select_staff" ON "public"."event_categories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "event_categories_write_staff" ON "public"."event_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_public" ON "public"."events" FOR SELECT USING (("published" = true));

CREATE POLICY "events_select_staff" ON "public"."events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "events_write_staff" ON "public"."events" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."fiesta_barangays" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiesta_barangays_select_public" ON "public"."fiesta_barangays" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."fiestas" "f"
  WHERE (("f"."id" = "fiesta_barangays"."fiesta_id") AND ("f"."published" = true)))));

CREATE POLICY "fiesta_barangays_select_staff" ON "public"."fiesta_barangays" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "fiesta_barangays_write_staff" ON "public"."fiesta_barangays" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."fiestas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiestas_select_public" ON "public"."fiestas" FOR SELECT USING (("published" = true));

CREATE POLICY "fiestas_select_staff" ON "public"."fiestas" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "fiestas_write_staff" ON "public"."fiestas" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('publish_events'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."item_embeddings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_embeddings_select" ON "public"."item_embeddings" FOR SELECT USING (((("kind" = 'place'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."places" "p"
  WHERE ("p"."id" = "item_embeddings"."item_id")))) OR (("kind" = 'business'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE ("b"."id" = "item_embeddings"."item_id"))))));

ALTER TABLE "public"."landing_slides" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_slides_select_public" ON "public"."landing_slides" FOR SELECT USING ("active");

CREATE POLICY "landing_slides_write_staff" ON "public"."landing_slides" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_landing'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_landing'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."place_categories" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_categories_select_public" ON "public"."place_categories" FOR SELECT USING (("active" = true));

CREATE POLICY "place_categories_select_staff" ON "public"."place_categories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "place_categories_write_staff" ON "public"."place_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."place_facilities" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_facilities_select_public" ON "public"."place_facilities" FOR SELECT USING (("active" = true));

CREATE POLICY "place_facilities_select_staff" ON "public"."place_facilities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "place_facilities_write_staff" ON "public"."place_facilities" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."place_photos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_photos_select_public" ON "public"."place_photos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."places" "pl"
  WHERE (("pl"."id" = "place_photos"."place_id") AND ("pl"."verification_status" = 'verified'::"text")))));

CREATE POLICY "place_photos_select_staff" ON "public"."place_photos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "place_photos_write_staff" ON "public"."place_photos" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."place_reviews" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_reviews_insert_staff" ON "public"."place_reviews" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "place_reviews_select_staff" ON "public"."place_reviews" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "places_insert_staff" ON "public"."places" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "places_select_public" ON "public"."places" FOR SELECT USING (("verification_status" = 'verified'::"text"));

CREATE POLICY "places_select_staff" ON "public"."places" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "places_update_staff" ON "public"."places" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('manage_places'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_admin" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"());

CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));

CREATE POLICY "profiles_select_staff_business_submitters" ON "public"."profiles" FOR SELECT USING ((("public"."is_admin"() OR "public"."has_permission"('review_businesses'::"text")) AND (EXISTS ( SELECT 1
   FROM "public"."businesses" "b"
  WHERE ("b"."submitted_by" = "profiles"."id")))));

CREATE POLICY "profiles_update_admin" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));

ALTER TABLE "public"."rec_hides" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_hides_own" ON "public"."rec_hides" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."route_progress" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "route_progress_own" ON "public"."route_progress" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."route_stops" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "route_stops_own_personal" ON "public"."route_stops" USING ((EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "route_stops"."route_id") AND "r"."personal" AND ("r"."created_by" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "route_stops"."route_id") AND "r"."personal" AND ("r"."created_by" = "auth"."uid"())))));

CREATE POLICY "route_stops_personal_owner_only" ON "public"."route_stops" AS RESTRICTIVE USING ((EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "route_stops"."route_id") AND ((NOT "r"."personal") OR ("r"."created_by" = "auth"."uid"()))))));

CREATE POLICY "route_stops_select_public" ON "public"."route_stops" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."routes" "r"
  WHERE (("r"."id" = "route_stops"."route_id") AND ("r"."status" = 'published'::"text")))));

CREATE POLICY "route_stops_select_staff" ON "public"."route_stops" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "route_stops_write_staff" ON "public"."route_stops" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."routes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routes_own_personal" ON "public"."routes" USING (("personal" AND ("created_by" = "auth"."uid"()))) WITH CHECK (("personal" AND ("created_by" = "auth"."uid"())));

CREATE POLICY "routes_personal_owner_only" ON "public"."routes" AS RESTRICTIVE USING (((NOT "personal") OR ("created_by" = "auth"."uid"())));

CREATE POLICY "routes_select_public" ON "public"."routes" FOR SELECT USING (("status" = 'published'::"text"));

CREATE POLICY "routes_select_staff" ON "public"."routes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "routes_write_staff" ON "public"."routes" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."saved_businesses" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_businesses_own" ON "public"."saved_businesses" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."saved_places" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_places_own" ON "public"."saved_places" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."saved_routes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_routes_own" ON "public"."saved_routes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));

ALTER TABLE "public"."trail_categories" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trail_categories_select_public" ON "public"."trail_categories" FOR SELECT USING (("active" = true));

CREATE POLICY "trail_categories_select_staff" ON "public"."trail_categories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")))))));

CREATE POLICY "trail_categories_write_staff" ON "public"."trail_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."trail_credentials" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trail_credentials_select_public" ON "public"."trail_credentials" FOR SELECT USING (true);

CREATE POLICY "trail_credentials_write_staff" ON "public"."trail_credentials" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."active_status" = 'active'::"text") AND (("p"."staff_role" = 'admin'::"text") OR ('build_trails'::"text" = ANY ("p"."system_permission")))))));

ALTER TABLE "public"."user_credentials" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_credentials_own" ON "public"."user_credentials" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_discovery_review_to_flag"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_discovery_review_to_flag"() TO "service_role";

GRANT ALL ON FUNCTION "public"."compute_discovery_content_needs_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_discovery_content_needs_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_discovery_content_needs_review"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_my_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_my_account"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_personal_trail_caps"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_personal_trail_caps"() TO "service_role";

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT ALL ON FUNCTION "public"."has_permission"("permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_permission"("permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("permission" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."locations_with_entries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."locations_with_entries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."locations_with_entries"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."log_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_activity"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."log_activity_child"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_activity_child"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."log_auth_event"("p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_auth_event"("p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_auth_event"("p_action" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."log_review_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_review_activity"() TO "service_role";

GRANT ALL ON FUNCTION "public"."rec_open_state"("hours" "text", "at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."rec_open_state"("hours" "text", "at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rec_open_state"("hours" "text", "at" timestamp with time zone) TO "service_role";

GRANT ALL ON FUNCTION "public"."recommend_items"("lat" double precision, "lng" double precision, "lim" integer, "anchor_kind" "text", "anchor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recommend_items"("lat" double precision, "lng" double precision, "lim" integer, "anchor_kind" "text", "anchor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recommend_items"("lat" double precision, "lng" double precision, "lim" integer, "anchor_kind" "text", "anchor_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."report_fiesta_coverage"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_fiesta_coverage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_fiesta_coverage"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."report_points"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."report_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_points"() TO "service_role";

GRANT ALL ON TABLE "public"."businesses" TO "anon";
GRANT ALL ON TABLE "public"."businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."businesses" TO "service_role";

GRANT ALL ON FUNCTION "public"."search_businesses"("q" "text", "lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_businesses"("q" "text", "lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_businesses"("q" "text", "lim" integer) TO "service_role";

GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";

GRANT ALL ON FUNCTION "public"."search_events"("q" "text", "lim" integer, "only_published" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."search_events"("q" "text", "lim" integer, "only_published" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_events"("q" "text", "lim" integer, "only_published" boolean) TO "service_role";

GRANT ALL ON TABLE "public"."fiestas" TO "anon";
GRANT ALL ON TABLE "public"."fiestas" TO "authenticated";
GRANT ALL ON TABLE "public"."fiestas" TO "service_role";

GRANT ALL ON FUNCTION "public"."search_fiestas"("q" "text", "lim" integer, "only_published" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."search_fiestas"("q" "text", "lim" integer, "only_published" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_fiestas"("q" "text", "lim" integer, "only_published" boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."search_fuzzy"("qn" "text", "nm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_fuzzy"("qn" "text", "nm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_fuzzy"("qn" "text", "nm" "text") TO "service_role";

GRANT ALL ON TABLE "public"."business_items" TO "anon";
GRANT ALL ON TABLE "public"."business_items" TO "authenticated";
GRANT ALL ON TABLE "public"."business_items" TO "service_role";

GRANT ALL ON FUNCTION "public"."search_items"("q" "text", "lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_items"("q" "text", "lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_items"("q" "text", "lim" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."search_norm"("t" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_norm"("t" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_norm"("t" "text") TO "service_role";

GRANT ALL ON TABLE "public"."places" TO "anon";
GRANT ALL ON TABLE "public"."places" TO "authenticated";
GRANT ALL ON TABLE "public"."places" TO "service_role";

GRANT ALL ON FUNCTION "public"."search_places"("q" "text", "lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_places"("q" "text", "lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_places"("q" "text", "lim" integer) TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT ALL ON FUNCTION "public"."search_staff"("q" "text", "lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_staff"("q" "text", "lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_staff"("q" "text", "lim" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."search_tier"("n" "text", "qn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_tier"("n" "text", "qn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_tier"("n" "text", "qn" "text") TO "service_role";

GRANT ALL ON TABLE "public"."routes" TO "anon";
GRANT ALL ON TABLE "public"."routes" TO "authenticated";
GRANT ALL ON TABLE "public"."routes" TO "service_role";

GRANT ALL ON FUNCTION "public"."search_trails"("q" "text", "lim" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_trails"("q" "text", "lim" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_trails"("q" "text", "lim" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_discovery_review_flag"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_discovery_review_flag"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."write_activity"("p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_label" "text", "p_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."write_activity"("p_action" "text", "p_target_type" "text", "p_target_id" "uuid", "p_target_label" "text", "p_details" "jsonb") TO "service_role";

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";

GRANT ALL ON TABLE "public"."business_categories" TO "anon";
GRANT ALL ON TABLE "public"."business_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."business_categories" TO "service_role";

GRANT ALL ON TABLE "public"."business_flags" TO "anon";
GRANT ALL ON TABLE "public"."business_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."business_flags" TO "service_role";

GRANT ALL ON TABLE "public"."business_item_photos" TO "anon";
GRANT ALL ON TABLE "public"."business_item_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."business_item_photos" TO "service_role";

GRANT ALL ON TABLE "public"."business_photos" TO "anon";
GRANT ALL ON TABLE "public"."business_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."business_photos" TO "service_role";

GRANT ALL ON TABLE "public"."business_reviews" TO "anon";
GRANT ALL ON TABLE "public"."business_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."business_reviews" TO "service_role";

GRANT ALL ON TABLE "public"."completed_routes" TO "anon";
GRANT ALL ON TABLE "public"."completed_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."completed_routes" TO "service_role";

GRANT ALL ON TABLE "public"."discovery_content" TO "anon";
GRANT ALL ON TABLE "public"."discovery_content" TO "authenticated";
GRANT ALL ON TABLE "public"."discovery_content" TO "service_role";

GRANT ALL ON TABLE "public"."entry_unlocks" TO "anon";
GRANT ALL ON TABLE "public"."entry_unlocks" TO "authenticated";
GRANT ALL ON TABLE "public"."entry_unlocks" TO "service_role";

GRANT ALL ON TABLE "public"."event_categories" TO "anon";
GRANT ALL ON TABLE "public"."event_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."event_categories" TO "service_role";

GRANT ALL ON TABLE "public"."fiesta_barangays" TO "anon";
GRANT ALL ON TABLE "public"."fiesta_barangays" TO "authenticated";
GRANT ALL ON TABLE "public"."fiesta_barangays" TO "service_role";

GRANT ALL ON TABLE "public"."item_embeddings" TO "anon";
GRANT ALL ON TABLE "public"."item_embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."item_embeddings" TO "service_role";

GRANT ALL ON TABLE "public"."landing_slides" TO "anon";
GRANT ALL ON TABLE "public"."landing_slides" TO "authenticated";
GRANT ALL ON TABLE "public"."landing_slides" TO "service_role";

GRANT ALL ON TABLE "public"."place_categories" TO "anon";
GRANT ALL ON TABLE "public"."place_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."place_categories" TO "service_role";

GRANT ALL ON TABLE "public"."place_facilities" TO "anon";
GRANT ALL ON TABLE "public"."place_facilities" TO "authenticated";
GRANT ALL ON TABLE "public"."place_facilities" TO "service_role";

GRANT ALL ON TABLE "public"."place_photos" TO "anon";
GRANT ALL ON TABLE "public"."place_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."place_photos" TO "service_role";

GRANT ALL ON TABLE "public"."place_reviews" TO "anon";
GRANT ALL ON TABLE "public"."place_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."place_reviews" TO "service_role";

GRANT ALL ON TABLE "public"."rec_hides" TO "anon";
GRANT ALL ON TABLE "public"."rec_hides" TO "authenticated";
GRANT ALL ON TABLE "public"."rec_hides" TO "service_role";

GRANT ALL ON TABLE "public"."route_progress" TO "anon";
GRANT ALL ON TABLE "public"."route_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."route_progress" TO "service_role";

GRANT ALL ON TABLE "public"."route_stops" TO "anon";
GRANT ALL ON TABLE "public"."route_stops" TO "authenticated";
GRANT ALL ON TABLE "public"."route_stops" TO "service_role";

GRANT ALL ON TABLE "public"."saved_businesses" TO "anon";
GRANT ALL ON TABLE "public"."saved_businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_businesses" TO "service_role";

GRANT ALL ON TABLE "public"."saved_places" TO "anon";
GRANT ALL ON TABLE "public"."saved_places" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_places" TO "service_role";

GRANT ALL ON TABLE "public"."saved_routes" TO "anon";
GRANT ALL ON TABLE "public"."saved_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_routes" TO "service_role";

GRANT ALL ON TABLE "public"."trail_categories" TO "anon";
GRANT ALL ON TABLE "public"."trail_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."trail_categories" TO "service_role";

GRANT ALL ON TABLE "public"."trail_credentials" TO "anon";
GRANT ALL ON TABLE "public"."trail_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."trail_credentials" TO "service_role";

GRANT ALL ON TABLE "public"."user_credentials" TO "anon";
GRANT ALL ON TABLE "public"."user_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."user_credentials" TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ---------------------------------------------------------------------------
-- auth.users trigger (was 0001): every new account gets a profiles row.
-- ---------------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage: content-photos bucket and policies (were 0031, 0033, 0051).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('content-photos', 'content-photos', true)
on conflict (id) do nothing;

-- Profile pictures (src/lib/avatar-storage.ts). Created by hand in the dashboard
-- on the live project; public, no size or type limit there. Its storage.objects
-- policies are NOT here yet (see the header note).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- RLS on storage.objects, scoped to this bucket only (bucket_id check in
-- every policy), same permission split as the tables these objects back:
-- place_photos is staff-only write (manage_places or admin, matching
-- 0003's place_photos_write_staff), business_photos is owner-or-staff
-- write (matching 0008's business_photos_write_own/write_staff split).
-- Public read on both since place_photos_select_public/
-- business_photos_select_public already gate the row itself on
-- verification_status, the file behind a verified row's URL has already
-- passed that same gate; a photo file with no matching row is orphaned
-- data, not a security concern gated by this policy.

create policy "content_photos_select_public"
  on storage.objects for select
  using (bucket_id = 'content-photos');

create policy "content_photos_write_staff"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (
          p.staff_role = 'admin'
          or 'manage_places' = any(p.system_permission)
          or 'review_businesses' = any(p.system_permission)
        )
    )
  )
  with check (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (
          p.staff_role = 'admin'
          or 'manage_places' = any(p.system_permission)
          or 'review_businesses' = any(p.system_permission)
        )
    )
  );

-- Vendor self-upload: a vendor manages photos for the business they
-- submitted, matching business_photos_write_own's own auth.uid() =
-- submitted_by check. Object path convention (businesses/<business_id>/...)
-- is enforced at the app layer when constructing upload paths, not by this
-- policy, same as route_stops/discovery_content's app-layer stop_type
-- guarantee noted in architecture-notes.md's Known Fragile Areas -- storage
-- policies can filter by bucket and path prefix but this repo has no prior
-- example of parsing a path segment into a policy condition, and adding
-- one here for a single write policy is a heavier pattern than the rest
-- of this migration needs.
create policy "content_photos_write_own_business"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.businesses b
      where b.submitted_by = auth.uid()
        and position(b.id::text in name) > 0
    )
  )
  with check (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.businesses b
      where b.submitted_by = auth.uid()
        and position(b.id::text in name) > 0
    )
  );

create policy "landing_photos_write_staff"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_landing' = any(p.system_permission))
    )
  )
  with check (
    bucket_id = 'content-photos'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and (p.staff_role = 'admin' or 'manage_landing' = any(p.system_permission))
    )
  );

create policy "content_photos_write_discovery_builders"
  on storage.objects for all
  using (
    bucket_id = 'content-photos'
    and name like 'discovery/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and 'build_trails' = any(p.system_permission)
    )
  )
  with check (
    bucket_id = 'content-photos'
    and name like 'discovery/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active_status = 'active'
        and 'build_trails' = any(p.system_permission)
    )
  );

-- ---------------------------------------------------------------------------
-- Reference data (final state of 0022, 0023, 0024, 0025, 0026, 0032, 0045).
-- Needed by the app in every environment, so it lives with the schema, not in
-- seed.sql. on conflict do nothing keeps a re-run harmless.
-- ---------------------------------------------------------------------------

insert into public.place_categories (name, icon, sort_order, color) values
  ('Heritage Site', 'landmark', 1, 'slate'),
  ('Museum', 'building-2', 2, 'slate'),
  ('Monument', 'flag', 3, 'indigo'),
  ('Church', 'church', 4, 'teal'),
  ('Cultural Site', 'palette', 5, 'orange'),
  ('Barangay Hall', 'building', 6, null)
on conflict (name) do nothing;

insert into public.trail_categories (name, icon, sort_order) values
  ('heritage walk', 'footprints', 1),
  ('food crawl', 'utensils', 2),
  ('cultural tour', 'palette', 3)
on conflict (name) do nothing;

insert into public.event_categories (name, icon, sort_order) values
  ('workshop', 'wrench', 1),
  ('festival', 'party-popper', 2),
  ('heritage walk', 'footprints', 3),
  ('program enrollment', 'clipboard-list', 4),
  ('general announcement', 'megaphone', 5),
  ('Cultural & Heritage', 'map-pin', 6),
  ('Youth & Education', 'map-pin', 7),
  ('Arts & Culture', 'map-pin', 8)
on conflict (name) do nothing;

insert into public.place_facilities (name, icon, sort_order) values
  ('Restrooms', 'bath', 1),
  ('Parking', 'square-parking', 2),
  ('Info Desk', 'info', 3),
  ('Waiting Area', 'armchair', 4)
on conflict (name) do nothing;

reset check_function_bodies;
