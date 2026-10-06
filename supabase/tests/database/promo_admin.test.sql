-- Promo admin (M9.3): admin + MFA, audited, codes never readable.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email, raw_app_meta_data, aud, role, email_confirmed_at)
values
  ('00000000-0000-0000-0000-0000000000b1', 'promo-admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'promo-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000000b3', 'promo-mod@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now());
select system_grant_role('promo-admin@test.local', 'admin');
select system_grant_role('promo-mod@test.local', 'moderator');

create temporary table t (name text primary key, value text) on commit drop;
grant all on t to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b3", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select admin_create_promo_campaign('Mod campaign')$$, '42501', null, 'moderators cannot manage promotions');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$select admin_create_promo_campaign('No MFA')$$, '42501', 'multi-factor authentication required', 'admins need MFA');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "aal": "aal2"}';
insert into t values ('campaign', admin_create_promo_campaign('Admin festival', 'Posters in clubs', 'Klub Hipnoza', max_redemptions_total => 100)::text);
select is((select name from promo_campaigns where id = (select value from t where name = 'campaign')::uuid), 'Admin festival',
  'admin with MFA creates a campaign and sees it');

insert into t select 'code' || row_number() over (), c
from admin_generate_promo_codes((select value from t where name = 'campaign')::uuid, 3, 'premium_days', 30) c;
select is((select count(*)::int from t where name like 'code%'), 3, 'a batch of codes is returned once');
select is((select count(*)::int from admin_list_promo_codes((select value from t where name = 'campaign')::uuid)), 3,
  'the list shows the codes by hint only');
select is((select count(*)::int from admin_list_promo_codes((select value from t where name = 'campaign')::uuid,
  lower((select value from t where name = 'code1')))), 1, 'lookup by hint (from a full code too)');
select throws_ok($$select admin_create_shared_promo_code((select value from t where name = 'campaign')::uuid, 'HIPNOZA26', 'premium_days', 14, null)$$,
  '22023', null, 'a shared code needs max uses');
select lives_ok($$select admin_create_shared_promo_code((select value from t where name = 'campaign')::uuid, 'HIPNOZA26', 'premium_days', 14, 50)$$,
  'a shared code is created');

-- Deactivation is immediate.
select lives_ok($$select admin_set_promo_code_active((select id from admin_list_promo_codes((select value from t where name = 'campaign')::uuid, 'za26')), false)$$,
  'a code is deactivated');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated", "aal": "aal1"}';
select is(redeem_promo_code('HIPNOZA26') ->> 'status', 'inactive', 'a deactivated code is refused at once');
select is(redeem_promo_code((select value from t where name = 'code1')) ->> 'status', 'granted', 'a generated code works');
select is((select plan_code from my_plan()), 'premium', 'Premium granted');

-- Revoking a redemption revokes its entitlement.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "aal": "aal2"}';
select is((select count(*)::int from admin_list_promo_redemptions((select value from t where name = 'campaign')::uuid)), 1,
  'the redemption is listed');
select lives_ok($$select admin_revoke_promo_redemption((select id from admin_list_promo_redemptions((select value from t where name = 'campaign')::uuid)), 'shared on a forum')$$,
  'admin revokes the redemption');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated", "aal": "aal1"}';
select is((select plan_code from my_plan()), 'free', 'the listener is back on Free');

reset role;
select is((select count(*)::int from private.audit_log
  where action in ('promo.campaign_created', 'promo.codes_generated', 'promo.shared_code_created', 'promo.code_active', 'promo.redemption_revoked', 'entitlement.revoke')
    and actor_id = '00000000-0000-0000-0000-0000000000b1'), 6, 'every admin change is audited');

select * from finish();
rollback;
