-- Staff actions require role + aal2 and are audited in the same transaction (M1.5).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000e1', 'admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'member@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

-- Bootstrap (server-side, secret key) grants the first admin and is audited as system.
select is(
  system_grant_role('ADMIN@test.local', 'admin'),
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  'system_grant_role finds the user by email (case-insensitive)');
select is(
  (select actor_kind from private.audit_log
   where subject_id = '00000000-0000-0000-0000-0000000000e1' and action = 'role.grant'),
  'system', 'bootstrap grant is audited as system');

-- Admin with only a password (aal1) is refused.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated", "aal": "aal1"}';
select throws_ok(
  $$select admin_set_feature_flag('closed_beta', false)$$,
  '42501', 'multi-factor authentication required', 'admin without MFA is refused');

-- Regular member with MFA is refused (no role).
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e2", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$select admin_grant_role('00000000-0000-0000-0000-0000000000e2', 'admin')$$,
  '42501', null, 'member cannot grant roles, even with MFA');

-- Admin with MFA can act; each action is audited.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$select admin_set_feature_flag('closed_beta', false)$$, 'admin with MFA can switch a flag');
select is(is_feature_enabled('closed_beta'), false, 'flag change took effect');
select lives_ok(
  $$select admin_grant_role('00000000-0000-0000-0000-0000000000e2', 'moderator')$$,
  'admin with MFA can grant a role');
select throws_ok(
  $$select admin_revoke_role('00000000-0000-0000-0000-0000000000e1', 'admin')$$,
  '42501', null, 'admin cannot remove own admin role');
select throws_ok(
  $$select admin_set_feature_flag('no_such_flag', true)$$,
  'P0002', null, 'unknown flags are rejected');
reset role;

select is(
  (select after from private.audit_log where action = 'feature_flag.set' and subject_id = 'closed_beta'),
  '{"enabled": false}'::jsonb, 'flag change audited with after state');
select is(
  (select actor_id from private.audit_log
   where action = 'role.grant' and subject_id = '00000000-0000-0000-0000-0000000000e2'),
  '00000000-0000-0000-0000-0000000000e1'::uuid, 'role grant audited with the acting admin');

-- Append-only, even for the table owner.
select throws_ok($$update private.audit_log set action = 'tampered'$$, '42501', null, 'audit rows cannot be updated');
select throws_ok($$delete from private.audit_log$$, '42501', null, 'audit rows cannot be deleted');

select * from finish();
rollback;
