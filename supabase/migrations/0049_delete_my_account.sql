-- Delete account, for residents only.
-- Human-approved before writing, per constraints.md's No Silent Overrides rule
-- and architecture-notes.md's never-touch-without-approval list (schema): the
-- project owner asked for it, "for user but not admin/staff".
--
-- What this adds: one function, public.delete_my_account(). No table, column,
-- constraint or policy changes.
--
-- Why a function and not the client: a signed in person cannot delete their own
-- auth.users row (that needs the service role), and nothing in the app holds
-- that key. The function runs as its owner and only ever touches auth.uid().
--
-- What goes with the account. Deleting the auth.users row cascades to profiles
-- (0001), and from there to everything keyed to the person with on delete
-- cascade: saved places, saved routes, saved businesses, completed routes,
-- credentials, route progress and recommendation hides (0007, 0018, 0046,
-- 0047). activity_log.actor_id is set null (0037), and only staff ever have
-- rows there anyway.
--
-- Two references have no delete rule, so a plain delete would fail on them:
--   - business_flags.flagged_by (0004): a report the person filed. The report
--     stays for staff to resolve and loses the reporter, so it is set null
--     here first. flagged_by is nullable already (system flags have none).
--   - businesses.submitted_by (0004): not null, and nobody can delete a
--     business (there is no delete policy), so an account with a listing is
--     refused with 'has_business' rather than silently deleting a public,
--     possibly CATO-verified listing, or reassigning it, which would need a
--     schema change. CATO removes the listing, then the person can delete.
--
-- Staff and admin accounts are refused with 'staff_account'. They are managed
-- from Admin, Staff, and a self-delete could lock the last admin out. The
-- other staff references (events.posted_by, routes.created_by, reviewed_by,
-- staff_id) would block it anyway; this just says so up front.
--
-- Errors are plain codes the client maps to a message: not_signed_in,
-- staff_account, has_business.

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
