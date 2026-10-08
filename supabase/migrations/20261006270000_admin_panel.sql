-- Admin panel reads (M10.3, security.md §3): staff list, feature flags, audit log, user lookup.
-- All admin + aal2; changes keep going through the existing audited admin_* functions.

/** Staff accounts with their public handle (no emails). */
create function public.admin_list_staff()
returns table (user_id uuid, handle text, display_name text, role public.app_role, granted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
    select r.user_id, p.handle::text, p.display_name, r.role, r.created_at
    from public.user_roles r
    left join public.profiles p on p.id = r.user_id
    order by r.role, p.handle;
end;
$$;

/** Finds an account by its public profile handle (staff grants, Premium for support). */
create function public.admin_find_user(handle text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return (select p.id from public.profiles p where p.handle = lower(trim(admin_find_user.handle)));
end;
$$;

create function public.admin_list_feature_flags()
returns table (key text, enabled boolean, description text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query select f.key, f.enabled, f.description, f.updated_at from public.feature_flags f order by f.key;
end;
$$;

/** The newest audit entries, optionally by action prefix (e.g. "moderation."). Read-only. */
create function public.admin_audit_log(max_results integer default 100, action_prefix text default null)
returns table (
  id bigint,
  created_at timestamptz,
  actor_kind text,
  actor_handle text,
  action text,
  subject_type text,
  subject_id text,
  before jsonb,
  after jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
    select l.id, l.created_at, l.actor_kind, p.handle::text, l.action, l.subject_type, l.subject_id, l.before, l.after
    from private.audit_log l
    left join public.profiles p on p.id = l.actor_id
    where action_prefix is null or l.action like replace(replace(action_prefix, '%', ''), '_', '\_') || '%'
    order by l.id desc
    limit least(greatest(max_results, 1), 500);
end;
$$;

revoke execute on function public.admin_list_staff() from public, anon;
revoke execute on function public.admin_find_user(text) from public, anon;
revoke execute on function public.admin_list_feature_flags() from public, anon;
revoke execute on function public.admin_audit_log(integer, text) from public, anon;
grant execute on function public.admin_list_staff() to authenticated;
grant execute on function public.admin_find_user(text) to authenticated;
grant execute on function public.admin_list_feature_flags() to authenticated;
grant execute on function public.admin_audit_log(integer, text) to authenticated;
