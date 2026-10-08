-- Admin panel reads (M10.3).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000004a1', 'ap-admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000004a2', 'ap-mod@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
update profiles set handle = 'ap-admin-test' where id = '00000000-0000-0000-0000-0000000004a1';
update profiles set handle = 'ap-mod-test' where id = '00000000-0000-0000-0000-0000000004a2';
select system_grant_role('ap-admin@test.local', 'admin');
select system_grant_role('ap-mod@test.local', 'moderator');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000004a2", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select * from admin_audit_log()$$, '42501', null, 'moderators cannot read the audit log');
select throws_ok($$select * from admin_list_staff()$$, '42501', null, 'nor the staff list');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$select * from admin_audit_log()$$, '42501', 'multi-factor authentication required', 'admins need MFA');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated", "aal": "aal2"}';
select ok((select count(*) from admin_list_staff() where handle in ('ap-admin-test', 'ap-mod-test')) = 2, 'the staff list shows both');
select is(admin_find_user(' AP-MOD-TEST '), '00000000-0000-0000-0000-0000000004a2'::uuid, 'users are found by handle');
select lives_ok($$select admin_revoke_role('00000000-0000-0000-0000-0000000004a2', 'moderator')$$, 'admin revokes a role');
select is((select actor_handle || ' ' || action from admin_audit_log(5, 'role.') limit 1), 'ap-admin-test role.revoke',
  'the audit log shows who did what, newest first, filtered by prefix');
select ok((select count(*) > 0 from admin_list_feature_flags() where key = 'closed_beta'), 'feature flags are listed');

select * from finish();
rollback;
