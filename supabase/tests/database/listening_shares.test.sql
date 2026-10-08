-- Monthly user-centric listening shares (D2).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-000000000ca1', 'ls-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000ca2', 'ls-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000ca3', 'ls-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000ca4', 'ls-admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
select system_grant_role('ls-admin@test.local', 'admin');
insert into public.artists (id, slug, name) values ('00000000-0000-0000-0000-000000000cb1', 'ls-artist', 'Udziały Test');
insert into public.artist_members (artist_id, user_id, role, accepted_at)
values ('00000000-0000-0000-0000-000000000cb1', '00000000-0000-0000-0000-000000000ca3', 'owner', now());
insert into public.releases (id, artist_id, slug, title, type)
values ('00000000-0000-0000-0000-000000000cc1', '00000000-0000-0000-0000-000000000cb1', 'ls-release', 'LS', 'single');
insert into public.tracks (id, release_id, track_number, title)
values ('00000000-0000-0000-0000-000000000cd1', '00000000-0000-0000-0000-000000000cc1', 1, 'LS Track');

-- Last month: the fan plays twice for real, once for 10 s, once as a soundcheck; the other plays once.
insert into public.listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, soundcheck)
select u, '00000000-0000-0000-0000-000000000cd1', '00000000-0000-0000-0000-000000000cc1', '00000000-0000-0000-0000-000000000cb1',
  date_trunc('month', now()) - interval '20 days', ms, sc
from (values
  ('00000000-0000-0000-0000-000000000ca1'::uuid, 180000, false),
  ('00000000-0000-0000-0000-000000000ca1'::uuid, 200000, false),
  ('00000000-0000-0000-0000-000000000ca1'::uuid, 10000, false),
  ('00000000-0000-0000-0000-000000000ca1'::uuid, 30000, true),
  ('00000000-0000-0000-0000-000000000ca2'::uuid, 30000, false)
) v(u, ms, sc);

select is(private.aggregate_listening_month((date_trunc('month', now()) - interval '1 month')::date), 2,
  'one share per listener and artist');
select is((select qualified_plays from listening_monthly_artist_shares where user_id = '00000000-0000-0000-0000-000000000ca1'), 2,
  'plays under 30 s and soundchecks do not qualify');
select is(private.aggregate_listening_month((date_trunc('month', now()) - interval '1 month')::date), 2,
  'recomputing a month replaces it');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000ca1", "role": "authenticated"}';
select is((select count(*)::int from listening_monthly_artist_shares), 1, 'a listener sees only their own shares');
select is((select count(*)::int from artist_monthly_listening('00000000-0000-0000-0000-000000000cb1')), 0,
  'listener numbers are for the artist''s team');
select throws_ok($$select * from admin_listening_shares(now()::date)$$, '42501', null, 'the month statement is for admins');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000ca3", "role": "authenticated"}';
select is((select listeners || ':' || qualified_plays from artist_monthly_listening('00000000-0000-0000-0000-000000000cb1')), '2:3',
  'the artist sees real listeners and qualified plays');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000ca4", "role": "authenticated", "aal": "aal2"}';
select is((select listeners from admin_listening_shares((date_trunc('month', now()) - interval '1 month')::date)
  where artist_slug = 'ls-artist'), 2, 'admins see the month per artist');

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-000000000ca2';
select is((select count(*)::int from listening_monthly_artist_shares where artist_id = '00000000-0000-0000-0000-000000000cb1' and user_id is null), 1,
  'a deleted account leaves its share detached, not attributed');

select * from finish();
rollback;
