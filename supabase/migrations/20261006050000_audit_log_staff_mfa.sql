-- Append-only audit log + staff actions that require MFA (aal2). docs/security.md §2–3, M1.5.

-- ---------------------------------------------------------------------------
-- Audit log: append-only, even for the table owner.
-- ---------------------------------------------------------------------------
create table private.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_kind text not null constraint audit_log_actor_kind check (actor_kind in ('user', 'system')),
  action text not null,
  subject_type text not null,
  subject_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_subject_idx on private.audit_log (subject_type, subject_id);
create index audit_log_actor_idx on private.audit_log (actor_id, created_at desc);

create function private.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_or_delete
  before update or delete on private.audit_log
  for each row execute function private.audit_log_is_append_only();

create trigger audit_log_no_truncate
  before truncate on private.audit_log
  for each statement execute function private.audit_log_is_append_only();

create function private.write_audit(
  action text,
  subject_type text,
  subject_id text,
  before jsonb default null,
  after jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_log (actor_id, actor_kind, action, subject_type, subject_id, before, after)
  values (
    (select auth.uid()),
    case when (select auth.uid()) is null then 'system' else 'user' end,
    action, subject_type, subject_id, before, after
  );
$$;

-- ---------------------------------------------------------------------------
-- Staff gate: role AND a second authentication factor in this session.
-- ---------------------------------------------------------------------------
create function public.require_staff(required public.app_role)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_app_role(required) then
    raise exception 'staff role % required', required using errcode = '42501';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'multi-factor authentication required' using errcode = '42501', hint = 'mfa_required';
  end if;
end;
$$;

revoke execute on function public.require_staff(public.app_role) from public, anon;
grant execute on function public.require_staff(public.app_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin actions (each writes the audit entry in the same transaction).
-- ---------------------------------------------------------------------------
create function public.admin_grant_role(target_user uuid, role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  insert into public.user_roles (user_id, role, granted_by)
  values (target_user, admin_grant_role.role, (select auth.uid()))
  on conflict do nothing;
  if found then
    perform private.write_audit('role.grant', 'user', target_user::text, null,
      jsonb_build_object('role', admin_grant_role.role));
  end if;
end;
$$;

create function public.admin_revoke_role(target_user uuid, role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  if target_user = (select auth.uid()) and admin_revoke_role.role = 'admin' then
    raise exception 'admins cannot remove their own admin role' using errcode = '42501';
  end if;
  delete from public.user_roles ur
  where ur.user_id = target_user and ur.role = admin_revoke_role.role;
  if found then
    perform private.write_audit('role.revoke', 'user', target_user::text,
      jsonb_build_object('role', admin_revoke_role.role), null);
  end if;
end;
$$;

create function public.admin_set_feature_flag(flag text, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous boolean;
begin
  perform public.require_staff('admin');
  select f.enabled into previous from public.feature_flags f where f.key = flag for update;
  if not found then
    raise exception 'unknown feature flag %', flag using errcode = 'P0002';
  end if;
  update public.feature_flags f
  set enabled = admin_set_feature_flag.enabled, updated_by = (select auth.uid())
  where f.key = flag;
  perform private.write_audit('feature_flag.set', 'feature_flag', flag,
    jsonb_build_object('enabled', previous), jsonb_build_object('enabled', admin_set_feature_flag.enabled));
end;
$$;

revoke execute on function public.admin_grant_role(uuid, public.app_role) from public, anon;
revoke execute on function public.admin_revoke_role(uuid, public.app_role) from public, anon;
revoke execute on function public.admin_set_feature_flag(text, boolean) from public, anon;
grant execute on function public.admin_grant_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_revoke_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_set_feature_flag(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap: the first admin is granted server-side (secret key), audited as "system".
-- ---------------------------------------------------------------------------
create function public.system_grant_role(target_email text, role public.app_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  select u.id into target from auth.users u where lower(u.email) = lower(target_email);
  if target is null then
    raise exception 'no user with this email' using errcode = 'P0002';
  end if;
  insert into public.user_roles (user_id, role) values (target, system_grant_role.role)
  on conflict do nothing;
  perform private.write_audit('role.grant', 'user', target::text, null,
    jsonb_build_object('role', system_grant_role.role, 'via', 'system_grant_role'));
  return target;
end;
$$;

revoke execute on function public.system_grant_role(text, public.app_role) from public, anon, authenticated;
grant execute on function public.system_grant_role(text, public.app_role) to service_role;
