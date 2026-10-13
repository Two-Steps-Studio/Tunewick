-- The newest migration the database has, so the admin panel can say when the database is behind
-- the deployed app (e.g. the migration bundle was not pasted yet). Admins only.

create function public.admin_schema_version()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return (select max(version) from supabase_migrations.schema_migrations);
end;
$$;

revoke execute on function public.admin_schema_version() from public, anon;
grant execute on function public.admin_schema_version() to authenticated;
