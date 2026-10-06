-- MFA is enforced for every API request, not only by the web app (docs/security.md §2).
--
-- Without this, a password alone (an aal1 session) of an account that has a verified second
-- factor could call the Data API directly — skipping the web app's redirect to the verification
-- page — and read or change that account's data. PostgREST runs this function before every
-- request (db-pre-request); the redirect in the web proxy stays as the friendly front door.

create function public.enforce_mfa()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated'
     and coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2'
     and exists (
       select 1 from auth.mfa_factors f
       where f.user_id = (select auth.uid()) and f.status = 'verified'
     ) then
    raise exception 'multi-factor authentication required'
      using errcode = '42501', hint = 'mfa_required';
  end if;
end;
$$;

revoke execute on function public.enforce_mfa() from public;
grant execute on function public.enforce_mfa() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request to 'public.enforce_mfa';
notify pgrst, 'reload config';
