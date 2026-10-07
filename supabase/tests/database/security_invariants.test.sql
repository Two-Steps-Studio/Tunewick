-- Security invariants of the whole schema (M11 security review). These hold for every table and
-- function, including ones added by future migrations: a new table without RLS or a definer
-- function without a fixed search_path fails here, not in production.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

-- 1. Every table in the API schema has row level security.
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[], 'every public table has RLS enabled');

-- 2. Anonymous visitors never write tables directly.
select is(
  (select coalesce(array_agg(distinct table_name::text order by table_name::text), '{}')
   from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  '{}'::text[], 'anon has no write grants on public tables');

-- 3. Signed-in users never update or delete without a policy-backed grant on: the tables they
--    may change are listed here on purpose, so a new grant is a deliberate change.
select is(
  (select coalesce(array_agg(distinct table_name::text order by table_name::text), '{}')
   from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
     and table_name not in (
       'profiles', 'profile_settings', 'artists', 'releases', 'release_artists', 'release_genres', 'tracks',
       'track_artists', 'credits', 'track_likes', 'release_likes', 'artist_follows', 'playlists',
       'playlist_tracks', 'listening_events', 'event_attendance', 'user_follows', 'user_blocks'
     )),
  '{}'::text[], 'authenticated can update/delete only the reviewed tables');

-- 4. Every security definer function pins its search_path.
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  '{}'::text[], 'security definer functions set search_path');

-- 5. Staff and system functions are not callable by anonymous visitors.
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'admin\_%' or p.proname like 'system\_%' or p.proname in ('moderate_report', 'decide_appeal',
       'review_release', 'review_event', 'review_artist_verification'))
     and has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[], 'admin, system and moderation functions are closed to anon');

-- 6. System functions (secret key only) are not callable by signed-in users either.
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'system\_%'
     and has_function_privilege('authenticated', p.oid, 'execute')),
  '{}'::text[], 'system functions are for the service role only');

-- 7. The private schema is not reachable through the Data API roles.
select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'private' and c.relkind in ('r', 'p', 'v')
        and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'))
    ),
  'private tables are not readable by API roles');

select * from finish();
rollback;
