-- Recommendations (recommendation-plan.md, recommendation-phases.md Phase 1).
-- Human-approved before writing, per constraints.md's No Silent Overrides rule
-- and architecture-notes.md's never-touch-without-approval list (schema, RLS
-- policies). Logged in decision-log.md as entry #40. Edit freely until PR 1
-- merges, after that changes go in 0047.
--
-- What this adds: one extension (vector), two tables (item_embeddings,
-- rec_hides) and two functions (rec_open_state, recommend_items). No existing
-- table, column or policy changes.
--
-- Why recommend_items is one SQL function: the Home row ("For you" / "Near
-- you" / "Around Pasig") and the "Similar" row on detail pages are the same
-- query, with and without an anchor item. It returns slim rows (kind, id,
-- reason, distance_km), not `setof <table>`, because one row type cannot cover
-- places and businesses. The client then loads the cards with ordinary queries,
-- as searchItems does (decision-log.md entries #29 and #31).
--
-- Rules the body follows (plan, Principles and Rules):
--   - No crowd signals. views_count, saves_count and business_flags are never
--     read. Registration status, photo count, description length and listing
--     completeness are never score inputs.
--   - Personal signals only: the caller's own saves, own completed trail stops
--     and own preferred categories. Nothing from other users.
--   - Missing hours are unknown, never closed. Only an owner-set "temporarily
--     closed" or "permanently closed" removes an item.
--   - Featured gets no boost. Placement is never sold.
--
-- RLS: both new tables follow existing shapes. item_embeddings is readable only
-- for items the caller can already read, and written only by the embed script
-- with the service role key (no insert, update or delete policy exists, so
-- nobody else can write). rec_hides is own-rows-only, the same shape as
-- saved_places_own (0007). Neither table is staff writable, so no log_activity
-- trigger (decision-log.md entry #19).

create extension if not exists vector with schema extensions;

-- 1. Embeddings. One row per place or business. kind plus item_id is a
-- type-plus-id pair with no foreign key, the same shape as route_stops (0005),
-- since the row can point at either table. The nightly embed script deletes
-- rows whose item no longer exists, the database does not. model is pinned per
-- row (model id plus dtype), so a model change is a re-embed. content_hash is
-- sha256 of model plus text, so unchanged listings are skipped.
create table public.item_embeddings (
  kind text not null check (kind in ('place', 'business')),
  item_id uuid not null,
  model text not null,
  content_hash text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz not null default now(),
  primary key (kind, item_id)
);

-- Readable only for items the caller can already read. The subselects run under
-- the caller's own policies on places and businesses, so an anon caller gets
-- verified places and verified or pending businesses (0003, 0015), an owner
-- also gets their own listing, staff get the rows their policies allow.
alter table public.item_embeddings enable row level security;

create policy "item_embeddings_select"
  on public.item_embeddings for select
  using (
    (kind = 'place' and exists (
      select 1 from public.places p where p.id = item_id
    ))
    or
    (kind = 'business' and exists (
      select 1 from public.businesses b where b.id = item_id
    ))
  );

-- 2. "Not interested". One row per user per hidden item. Hides one item, never
-- a category. Applies to recommendation rows only, Search, Discover and trails
-- still show the item. Not a taste signal, and never affects other users or a
-- listing's status. Guests cannot hide: auth.uid() is null for them, so the
-- policy below fails their insert.
create table public.rec_hides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('place', 'business')),
  item_id uuid not null,
  hidden_at timestamptz not null default now(),
  unique (user_id, kind, item_id)
);

alter table public.rec_hides enable row level security;

create policy "rec_hides_own"
  on public.rec_hides for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Open state from the hours text. Returns 'out' (marked temporarily or
-- permanently closed), 'open', 'shut' or 'unknown'.
--
-- Reads the JSON v1 format from src/lib/hours.ts: {"v":1,"mode":...,"days":
-- {"mon":[["09:00","17:00"]],...}}. Times are HH:MM, "24:00" is end of day (a
-- range is open at its start minute and shut at its end minute), an empty day
-- is closed, and ranges never cross midnight. Split shifts are several ranges.
-- Anything else (empty, older free text such as "Tuesday to Sunday, 9:00 AM -
-- 4:00 PM", broken JSON, a v:1 value with a bad day) is 'unknown', never an
-- error, so one bad row cannot break the whole call. 'unknown' is neutral in
-- the score, it is never read as closed.
--
-- Time is Asia/Manila, since the database clock is UTC. Only the day being
-- checked is validated, hours.ts rejects the whole value if any day is bad.
-- That mismatch can only matter for a hand-edited value.
create or replace function public.rec_open_state(hours text, at timestamptz default now())
returns text
language plpgsql stable
as $$
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

-- 4. The recommender. SECURITY INVOKER like the search_* functions (0042), so
-- the caller's own policies still decide which saves, hides, embeddings and
-- route stops it can read. Status is filtered inside the function as well,
-- because owner and staff policies are wider than public ones (decision-log.md
-- entries #29 and #31), and a signed in owner would otherwise see their own
-- unverified listing here.
--
-- Arguments: lat and lng are the caller's position (both null for no location),
-- lim is the row cap (clamped to 1..30), anchor_kind and anchor_id switch to
-- "Similar" mode: taste becomes that one item's embedding, the item itself is
-- left out, and preferred categories are not applied (the page is about the
-- anchor, not about the person).
--
-- Who can be recommended: verified places, verified or pending businesses
-- (Pending is on purpose, small vendors sit there first), not marked closed,
-- not already saved, not hidden. An item with no pin only counts when the
-- location is unusable.
--
-- Score is integer points: taste band + preferred category + open now +
-- distance decay. Points are cut into coarse steps of step_pts so near equals
-- tie, and inside a step the order is a hash of user (or coarse area), day and
-- item, so the row is stable for a day and rotates the next. At most
-- cap_per_category per category.
--
-- All weights live in the declare block. Order of strength, settled in Phase 4:
-- taste sets the coarse order (one band step, 48 points, is worth more than the
-- whole distance range, 36), distance sets the next, open now is the smallest
-- (12). Taste bands are ranks across the candidates, so none of these numbers
-- depend on where e5 scores sit (they bunch in a narrow high range). Real
-- vectors change which items land in a band, never what a band is worth.
--
-- ponytail: exact cosine search, no vector index. Add one only when the
-- function is slow on real data (plan, Score).
-- ponytail: taste bands are rank bands across the candidates, not fixed cosine
-- cutoffs, because e5 scores sit in a narrow high range. A "Similar to" reason
-- therefore means "among the closest of today's candidates", not "above a
-- similarity threshold".
-- ponytail: the bounding box only saves haversine work. Delete it if it ever
-- surprises, the only change is that items beyond about 22 km then stay in.
-- ponytail: cap_per_category can leave a row shorter than lim when there are
-- few categories. Accepted, a short row beats three of the same kind.
-- ponytail: no re-embed the moment a listing changes. A new or edited listing
-- has no (or an old) embedding until the nightly script runs, and counts as
-- neutral taste until then (taste_missing_pts), never as a low score.
-- ponytail: the constants below were tuned on the synthetic fixtures in
-- supabase/recommend_check.sql. Because bands are ranks they carry over to real
-- vectors unchanged. The neighbours and the thin-listing test on the real model
-- are read by hand with `npm run embed -- --neighbours` (scripts/embed-items.mjs).
-- Retune only if that output shows a thin listing sitting in the lowest band.
-- ponytail: the test hook app.rec_now cannot be set by API clients (they only
-- call exposed functions), it exists for supabase/recommend_check.sql.
create or replace function public.recommend_items(
  lat double precision default null,
  lng double precision default null,
  lim int default 12,
  anchor_kind text default null,
  anchor_id uuid default null
)
returns table (kind text, id uuid, reason text, distance_km double precision)
language plpgsql stable
set search_path = public, extensions
as $$
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
        select 1 from public.rec_hides h
        where h.user_id = uid and h.kind = c.k and h.item_id = c.iid)
  ),
  -- Haversine km from the caller to each pinned item. The box test is a cheap
  -- gate (0.2 degree is about 22 km). An item outside it gets no distance, so
  -- with a usable location it is left out (it would score about zero anyway).
  dist as (
    select e.*, case
      when lat is not null and lng is not null and e.la is not null and e.lo is not null
           and abs(e.la - lat) <= 0.2 and abs(e.lo - lng) <= 0.2
      then 2 * 6371 * asin(least(1, sqrt(
             sin(radians((e.la - lat) / 2)) ^ 2
             + cos(radians(lat)) * cos(radians(e.la)) * sin(radians((e.lo - lng) / 2)) ^ 2)))
      end as d
    from elig e
  ),
  -- Location is usable when it was sent and the nearest eligible item is within
  -- nearby_km (a tourist still outside Pasig gets the rotated fallback instead).
  loc as (
    select coalesce(min(d) <= nearby_km, false) as ok from dist
  ),
  pool as (
    select d.*, l.ok as loc_ok
    from dist d cross join loc l
    where (l.ok and d.d is not null) or not l.ok
  ),
  -- What defines taste: the anchor alone, or the caller's own saved places and
  -- own completed trail stops. Only items that have an embedding count.
  src as (
    select s.k, s.iid, e.embedding, n.name
    from (
      select 'place'::text as k, sp.place_id as iid
      from public.saved_places sp
      where not anchored and sp.user_id = uid
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
                   'g:' || case when sc.loc_ok then round(lat::numeric, 2)::text || ',' || round(lng::numeric, 2)::text
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

-- Same reload 0042 to 0045 end with.
notify pgrst, 'reload schema';
