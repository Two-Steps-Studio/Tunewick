-- Processing errors reported by the worker, shown to admins.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000005a1', 'we-admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005a2', 'we-mod@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
select system_grant_role('we-admin@test.local', 'admin');
select system_grant_role('we-mod@test.local', 'moderator');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a2", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select report_worker_error('image', null, 'x')$$, '42501', null,
  'only the worker reports errors');
select throws_ok($$select admin_media_health()$$, '42501', null, 'moderators do not see processing health');
reset role;

set local role service_role;
select lives_ok(
  $$select report_worker_error('image', gen_random_uuid(), 'ClientError: An error occurred (AccessDenied) when calling the GetObject operation: Access Denied')$$,
  'the worker reports an error');
select lives_ok($$select report_worker_error('audio', null, repeat('x', 900))$$, 'long messages are cut, not refused');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated", "aal": "aal2"}';
select ok((admin_media_health() ->> 'errors_24h')::int >= 2, 'admins see how many errors there were');
select ok(admin_media_health() -> 'recent_errors' @> '[{"kind": "image"}]'
  and exists (select 1 from jsonb_array_elements(admin_media_health() -> 'recent_errors') e
    where e ->> 'message' like '%AccessDenied%'),
  'and the latest messages');

select * from finish();
rollback;
