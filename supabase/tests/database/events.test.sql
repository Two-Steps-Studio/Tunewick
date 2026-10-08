-- Events and venues (M8.1).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000005a1', 'ev-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005a2', 'ev-guest@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005a3', 'ev-mod@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
select system_grant_role('ev-mod@test.local', 'moderator');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a2", "role": "authenticated"}';
insert into ids values ('guest', create_artist('Gość Wieczoru', 'gosc-wieczoru-ev'));

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Koncertowy Test', 'koncertowy-test-ev'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'artist'), 'demo', 'Demo', 'single');
insert into ids values ('venue', find_or_create_venue('Klub Hipnoza', 'Katowice', 'slaskie', 'pl. Sejmu Śląskiego 2'));
select is(find_or_create_venue('KLUB HIPNOZA', 'katowice', 'slaskie'), (select id from ids where name = 'venue'),
  'the same venue is found again (case and accents ignored)');
select is((select slug::text || ':' || verified from venues where id = (select id from ids where name = 'venue')),
  'klub-hipnoza-katowice:false', 'new venues get an address and are unverified');

select throws_ok($$select create_event((select id from ids where name = 'artist'), 'Za późno', (select id from ids where name = 'venue'), now() - interval '3 days')$$,
  '22023', null, 'past events cannot be added');
insert into ids values ('event', create_event((select id from ids where name = 'artist'), 'Premiera EP',
  (select id from ids where name = 'venue'), date_trunc('day', now()) + interval '10 days 20 hours',
  array[(select id from ids where name = 'guest'), (select id from ids where name = 'artist')], 'https://bilety.example/premiera'));
select is((select array_agg(a.name order by l.position) from event_lineup l join artists a on a.id = l.artist_id
  where l.event_id = (select id from ids where name = 'event')), array['Koncertowy Test', 'Gość Wieczoru'],
  'the lineup starts with the adding artist, without duplicates');
select is((select status::text from events where id = (select id from ids where name = 'event')), 'pending',
  'new events wait for a moderator');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a2", "role": "authenticated"}';
select throws_ok($$select create_event((select id from ids where name = 'artist'), 'Nie moje', (select id from ids where name = 'venue'), now() + interval '5 days')$$,
  '42501', null, 'only the artist''s owners and managers add its events');

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day'
where artist_id = (select id from ids where name = 'artist');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from events where id = (select id from ids where name = 'event')), 0, 'pending events are not public');
select is((select count(*)::int from upcoming_events() where event_id = (select id from ids where name = 'event')), 0,
  'nor listed');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a3", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select review_event((select id from ids where name = 'event'), 'reject', 'nie')$$, '22023', null,
  'a rejection needs a reason');
select lives_ok($$select review_event((select id from ids where name = 'event'), 'publish')$$, 'the moderator publishes');
select throws_ok($$select review_event((select id from ids where name = 'event'), 'publish')$$, '55000', null, 'once');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select title || ' @ ' || venue_name || ', ' || city from upcoming_events('slaskie') where event_id = (select id from ids where name = 'event')),
  'Premiera EP @ Klub Hipnoza, Katowice', 'published events are listed in their voivodeship');
select is((select count(*)::int from upcoming_events('mazowieckie') where event_id = (select id from ids where name = 'event')), 0,
  'and not in others');
select is((select jsonb_array_length(lineup) from upcoming_events() where event_id = (select id from ids where name = 'event')), 2,
  'with their lineup');

-- Sharing a published lineup relates the artists ("played together"), with the event as evidence.
select is((select relation || ':' || (evidence ->> 'event') from related_artists((select id from ids where name = 'guest'))
  where name = 'Koncertowy Test'), 'played_together:Premiera EP', 'artists who played together are related');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}';
select lives_ok($$select cancel_event((select id from ids where name = 'event'))$$, 'the artist cancels');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select status::text from upcoming_events() where event_id = (select id from ids where name = 'event')), 'cancelled',
  'a cancelled event stays listed as cancelled (people may have planned to go)');
select is((select count(*)::int from related_artists((select id from ids where name = 'guest')) where name = 'Koncertowy Test'), 0,
  'a cancelled gig no longer relates them');

select * from finish();
rollback;
