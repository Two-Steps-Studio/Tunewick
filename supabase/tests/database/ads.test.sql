-- Ads: Free listeners and visitors only, by placement and language, anonymous counts, admin-only management.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_app_meta_data, aud, role, created_at)
values
  ('00000000-0000-0000-0000-0000000006a1', 'ads-admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000006a2', 'ads-free@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000006a3', 'ads-premium@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now());
select system_grant_role('ads-admin@test.local', 'admin');
insert into entitlements (user_id, plan_code, source, starts_at)
values ('00000000-0000-0000-0000-0000000006a3', 'premium', 'admin', now() - interval '1 day');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a2", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select admin_save_ad_campaign(null, 'X', 'Y', '', 'Go', 'https://example.com', '',
  array['scene']::ad_placement[], '{}', 1::smallint, null, null)$$, '42501', null, 'listeners cannot create campaigns');
select throws_ok('select count(*) from ad_campaigns', '42501', null, 'nor read the table');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated", "aal": "aal2"}';
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anon;
insert into ids select 'polish', admin_save_ad_campaign(null, 'Klub Hałda', 'Koncerty w piątki', '', 'Zobacz',
  'https://example.com/halda', '', array['scene', 'browse']::ad_placement[], array['pl'], 1::smallint, null, null);
select is((select count(*)::integer from ad_for('scene', 'pl')), 0, 'a new campaign starts paused');
select lives_ok($$select admin_set_ad_campaign_active((select id from ids where name = 'polish'), true)$$, 'admin starts it');
select throws_ok($$select admin_save_ad_campaign(null, 'X', 'Y', '', 'Go', '', '',
  array['scene']::ad_placement[], '{}', 1::smallint, null, null)$$, '23514', null, 'a campaign needs a destination');
select throws_ok($$select admin_save_ad_campaign(null, 'X', 'Y', '', 'Go', null, 'nikt/nic',
  array['scene']::ad_placement[], '{}', 1::smallint, null, null)$$, 'P0002', null, 'a promoted release must exist');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a2", "role": "authenticated"}';
select is((select headline from ad_for('scene', 'pl')), 'Koncerty w piątki', 'a Free listener sees it where it is placed');
select is((select count(*)::integer from ad_for('library', 'pl')), 0, 'and nowhere else');
select is((select count(*)::integer from ad_for('scene', 'en')), 0, 'nor in other languages');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a3", "role": "authenticated"}';
select is((select count(*)::integer from ad_for('scene', 'pl')), 0, 'Premium never sees ads');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select lives_ok($$select record_ad_event((select id from ids where name = 'polish'), 'scene', 'impression');
  select record_ad_event((select id from ids where name = 'polish'), 'scene', 'click');
  select record_ad_event((select id from ids where name = 'polish'), 'library', 'click')$$, 'visitors count anonymously');

reset role;
select is((select impressions || '/' || clicks from private.ad_stats where campaign_id = (select id from ids where name = 'polish')),
  '1/1', 'counts only where the campaign runs, without who');

select * from finish();
rollback;
