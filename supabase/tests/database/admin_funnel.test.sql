-- Admin funnel and active listeners: counts per step, admins only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

insert into auth.users (id, email, raw_app_meta_data, aud, role, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000011a1', 'fn-admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000011a2', 'fn-new@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', null);
select system_grant_role('fn-admin@test.local', 'admin');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000011a2", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select * from admin_funnel(30)$$, '42501', null, 'listeners cannot read the funnel');
select throws_ok($$select * from admin_active_listeners()$$, '42501', null, 'nor active listeners');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000011a1", "role": "authenticated", "aal": "aal2"}';
select is((select array_agg(step) from admin_funnel(30)),
  array['signed_up', 'confirmed', 'onboarded', 'listened', 'engaged', 'returned'], 'six steps in order');
select ok((select accounts from admin_funnel(30) where step = 'signed_up')
  > (select accounts from admin_funnel(30) where step = 'confirmed'),
  'an unconfirmed account counts as signed up, not confirmed');
select is((select count(*) from admin_active_listeners()), 1::bigint, 'active listeners: one row of counts');

select * from finish();
rollback;
