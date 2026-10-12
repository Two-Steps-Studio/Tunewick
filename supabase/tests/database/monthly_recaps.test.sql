-- M14.6: monthly recaps, stored once the month is over.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email, raw_app_meta_data, aud, role, created_at)
values
  ('00000000-0000-0000-0000-0000000006a1', 'recap-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now() - interval '1 year'),
  ('00000000-0000-0000-0000-0000000006a2', 'recap-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now() - interval '1 year');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Recap', 'recap-test'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'recap', 'Recap', 'single');
insert into ids select 'release', id from releases where slug = 'recap' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('track', add_track((select id from ids where name = 'release'), 'Jeden'));

-- Two plays in the middle of last month (UTC listener).
set local role postgres;
update private.listening_daily_state set processed_until = now() - interval '70 days';
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, soundcheck)
select '00000000-0000-0000-0000-0000000006a2', (select id from ids where name = 'track'), (select id from ids where name = 'release'),
  (select id from ids where name = 'artist'), date_trunc('month', now()) - interval '15 days' + v.at, 200000, true, false
from (values (interval '0'), (interval '1 hour')) v(at);
select private.refresh_listening_daily();

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a2", "role": "authenticated"}';
select is((my_month_recap((date_trunc('month', now()) - interval '1 month')::date)->>'plays')::int, 2, 'last month: two plays');
select is((select count(*)::int from listening_recaps), case when extract(day from now()) > 1 then 1 else 0 end,
  'a finished month is stored (from its second day after)');
select is((my_month_recap(current_date)->>'plays')::int, 0, 'this month is computed live');
select is((select count(*)::int from listening_recaps where month = date_trunc('month', now())::date), 0, 'and never stored');
select is(my_month_recap((current_date + interval '2 months')::date), null, 'no recap for the future');
select is(my_month_recap('2000-01-01'), null, 'nor before the listener joined');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated"}';
select is((select count(*)::int from listening_recaps), 0, 'nobody sees another listener''s recaps');

select * from finish();
rollback;
