-- Typo and missing-character tolerant search (decision-log.md entry #31).
-- Human-approved before writing, per constraints.md and architecture-notes.md's
-- never-touch-without-approval list (schema, RLS policies). No table, column
-- or policy changes: this adds two extensions, six indexes and nine functions.
--
-- Why functions: PostgREST's `ilike` filter can only do substring matches, and
-- cannot reach pg_trgm's `<%` operator or fuzzystrmatch's levenshtein. Each
-- search_* function below returns `setof <table>`, so supabase-js keeps
-- chaining `.select("id, name, x(name)")` embeds on it exactly as it did on
-- `.from(table)`, in one round trip.
--
-- RLS: every search_* function is SECURITY INVOKER (the default) and reads the
-- real table, so the caller's own select policy still decides which rows
-- exist. global-search.ts and admin-global-search.ts get their usual public
-- and staff visibility with no change to either policy set.
--
-- What matches, on the normalized text (see search_norm): a name matches when
--   1. it contains the query, or
--   2. it passes the trigram prefilter (word similarity >= 0.2, which the GIN
--      index answers) AND either its word similarity is >= 0.5 (catches
--      joined or split words, long queries, short spelling variants) OR every
--      query word is in the name or within a few edits of one of its words
--      (catches a missing, extra, wrong or swapped letter).
-- Edits allowed per query word: 0 for 1-3 letters (too short to guess),
-- 1 for 4 letters, 2 for 5+. Postgres counts a swapped pair as 2 edits.
-- Queries under 3 characters only do rule 1. Checked offline against the seed
-- names before writing: about 98% of missing-letter, 100% of extra- and
-- wrong-letter and 95% of swapped-letter single typos were found, 91% for
-- 4-5 letter words (trigram alone at 0.5 managed 85/100/64/40/48).
--
-- Ranking, best first: exact name, name starts with the query, a word starts
-- with the query, name contains the query, then fuzzy only; within a tier by
-- word similarity, then name. Fuzzy only rescues what the literal rules
-- miss, it never reorders a literal hit.
--
-- ponytail: the threshold (0.2 prefilter, 0.5 direct), the edit allowances and
-- the 100 character query cap are starting values, tune them on real Pasig
-- data. Words of 1-3 letters get no typo tolerance.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- Lowercase; fold the accented letters Filipino names use (Niño, Peña, José)
-- to plain letters so "nino" finds "Niño"; drop apostrophes; turn every other
-- run of non-letters and non-digits (hyphens, &, parentheses, extra spaces,
-- emoji, a typed % or _) into one space; trim. So "Dimas-Alang" and "dimas
-- alang" normalize the same, "Ado's" becomes "ados", and a query made only of
-- symbols normalizes to '' and returns nothing. translate() and
-- regexp_replace() are IMMUTABLE, which an index expression needs (the
-- unaccent extension is not). The last two characters of translate's first
-- list have no partner in the second list, so translate deletes them: the
-- straight and the curly apostrophe.
create or replace function public.search_norm(t text)
returns text
language sql immutable parallel safe
as $$
  select btrim(regexp_replace(
    translate(lower(t), 'áàâäãåéèêëíìîïóòôöõúùûüñç''’', 'aaaaaaeeeeiiiiooooouuuunc'),
    '[^[:alnum:]]+', ' ', 'g'))
$$;

-- 0 exact, 1 starts with, 2 a word starts with, 3 contains, 4 fuzzy only.
-- Both arguments are already search_norm()-ed.
create or replace function public.search_tier(n text, qn text)
returns int
language sql immutable parallel safe
as $$
  select case
    when n = qn then 0
    when n like qn || '%' then 1
    when n like '% ' || qn || '%' then 2
    when n like '%' || qn || '%' then 3
    else 4
  end
$$;

-- True when EVERY word of the query is inside the name, or within the allowed
-- edits of one of the name's words. Both arguments are already search_norm()-ed.
-- levenshtein_less_equal stops early once the limit is passed, and left(...,40)
-- keeps a pasted giant word under levenshtein's 255 character argument limit.
create or replace function public.search_fuzzy(qn text, nm text)
returns boolean
language sql immutable parallel safe
set search_path = public, extensions
as $$
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

-- The indexes serve the LIKE and the `<%` halves of the WHERE below. The
-- expression must match the one the functions use, or Postgres ignores them.
-- If search_norm() is ever changed, drop and recreate all six.
create index if not exists places_name_trgm on public.places
  using gin (public.search_norm(name) extensions.gin_trgm_ops);
create index if not exists businesses_name_trgm on public.businesses
  using gin (public.search_norm(name) extensions.gin_trgm_ops);
create index if not exists routes_name_trgm on public.routes
  using gin (public.search_norm(name) extensions.gin_trgm_ops);
create index if not exists events_title_trgm on public.events
  using gin (public.search_norm(title) extensions.gin_trgm_ops);
create index if not exists business_items_name_trgm on public.business_items
  using gin (public.search_norm(name) extensions.gin_trgm_ops);
create index if not exists profiles_display_name_trgm on public.profiles
  using gin (public.search_norm(display_name) extensions.gin_trgm_ops);

-- The trigram threshold is set per call, and locally to the request's
-- transaction (set_config(..., true)), so nothing else sees it. Pass `lim` as
-- the row cap.

create or replace function public.search_places(q text, lim int default 5)
returns setof public.places
language plpgsql stable
set search_path = public, extensions
as $$
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

create or replace function public.search_businesses(q text, lim int default 5)
returns setof public.businesses
language plpgsql stable
set search_path = public, extensions
as $$
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

create or replace function public.search_trails(q text, lim int default 5)
returns setof public.routes
language plpgsql stable
set search_path = public, extensions
as $$
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

-- only_published defaults to true for the public bar. The staff bar passes
-- false, since a staff member looking for a draft announcement must find it.
-- It is inside the function (not just a filter after it) so the row cap
-- counts only rows the caller may actually see.
create or replace function public.search_events(q text, lim int default 5, only_published boolean default true)
returns setof public.events
language plpgsql stable
set search_path = public, extensions
as $$
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

-- Items keep the store-status rule global-search.ts already repeats
-- (verified or pending only, decision-log.md entry #29), here too so the row
-- cap counts only rows that will be shown. Same-name items tie on similarity,
-- then fall to name, then price low to high with unpriced last.
create or replace function public.search_items(q text, lim int default 4)
returns setof public.business_items
language plpgsql stable
set search_path = public, extensions
as $$
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

-- Staff accounts for the admin bar only (profiles, role = 'staff', same scope
-- as admin-staff.tsx's list). profiles_select_admin (0001, via is_admin() since
-- 0009) is what limits this to admins: for anyone else the function returns
-- zero rows, not an error, as admin-global-search.ts already expects. The role
-- check is inside the function so the row cap counts only staff accounts, not
-- residents, which are the bulk of this table. display_name can be null,
-- search_norm(null) is null, and a null never matches.
create or replace function public.search_staff(q text, lim int default 5)
returns setof public.profiles
language plpgsql stable
set search_path = public, extensions
as $$
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

notify pgrst, 'reload schema';
