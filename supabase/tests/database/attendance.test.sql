-- "Byłem przy tym" (M8.2).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000006a1', 'at-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006a2', 'at-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000006a3', 'at-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Obecność Test', 'obecnosc-test-at'));
insert into ids values ('venue', find_or_create_venue('Spodek Test', 'Katowice', 'slaskie'));
insert into ids values ('now', create_event((select id from ids where name = 'artist'), 'Trwa teraz', (select id from ids where name = 'venue'), now() - interval '1 hour'));
insert into ids values ('later', create_event((select id from ids where name = 'artist'), 'Za tydzień', (select id from ids where name = 'venue'), now() + interval '7 days'));
insert into ids values ('pending', create_event((select id from ids where name = 'artist'), 'Niezatwierdzony', (select id from ids where name = 'venue'), now() - interval '2 hours'));
set local role postgres;
update events set status = 'published' where id in ((select id from ids where name = 'now'), (select id from ids where name = 'later'));
insert into events (title, venue_id, starts_at, status, artist_id)
values ('Dawno temu', (select id from ids where name = 'venue'), now() - interval '40 days', 'published', (select id from ids where name = 'artist'));
insert into ids select 'old', id from events where title = 'Dawno temu';

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a2", "role": "authenticated"}';
select lives_ok($$select mark_attended((select id from ids where name = 'now'))$$, 'a listener marks a gig that has started');
select lives_ok($$select mark_attended((select id from ids where name = 'now'))$$, 'marking twice is harmless');
select throws_ok($$select mark_attended((select id from ids where name = 'later'))$$, '55000', 'the event has not started yet',
  'not before it starts');
select throws_ok($$select mark_attended((select id from ids where name = 'old'))$$, '55000', 'it is too late to mark this event',
  'not later than 30 days after');
select throws_ok($$select mark_attended((select id from ids where name = 'pending'))$$, 'P0002', null, 'not for unpublished events');
select throws_ok($$insert into event_attendance (event_id) values ((select id from ids where name = 'later'))$$, '42501', null,
  'nobody bypasses the window by writing the table');
select is((select count(*)::int from event_attendance), 1, 'the listener sees their memory');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000006a3", "role": "authenticated"}';
select is((select count(*)::int from event_attendance), 0, 'nobody else does (no public counters)');

select * from finish();
rollback;
