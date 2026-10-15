-- Premieres: scheduled releases show a premiere page, reminders only for upcoming releases, and
-- a reminder becomes a library entry once the release is out.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000010a1', 'pr-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000010a2', 'pr-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000010a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Premiera', 'premiera-pr'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'wkrotce', 'Wkrótce', 'single'),
       ((select id from ids where name = 'artist'), 'juz', 'Już', 'single');
insert into ids select slug, id from releases where artist_id = (select id from ids where name = 'artist');

set local role postgres;
update releases set status = 'published', publish_at = now() + interval '3 days'
where id = (select id from ids where name = 'wkrotce');
update releases set status = 'published', publish_at = now() - interval '1 day'
where id = (select id from ids where name = 'juz');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select title from upcoming_releases('premiera-pr', 'wkrotce')), 'Wkrótce',
  'a scheduled release has a public premiere page');
select is((select count(*) from upcoming_releases('premiera-pr', 'juz')), 0::bigint,
  'a release that is out is not upcoming');
select is((select count(*) from releases where id = (select id from ids where name = 'wkrotce')), 0::bigint,
  'the release itself (tracks, audio) stays hidden until the date');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000010a2", "role": "authenticated"}';
select lives_ok($$insert into release_reminders (release_id) values ((select id from ids where name = 'wkrotce'))$$,
  'a listener can ask to be reminded of an upcoming release');
select throws_ok($$insert into release_reminders (release_id) values ((select id from ids where name = 'juz'))$$,
  '42501', null, 'no reminders for releases that are already out');

-- The date arrives.
set local role postgres;
update releases set publish_at = now() - interval '1 minute' where id = (select id from ids where name = 'wkrotce');
select private.deliver_release_reminders();
select ok(exists (select 1 from release_likes where user_id = '00000000-0000-0000-0000-0000000010a2'
  and release_id = (select id from ids where name = 'wkrotce')), 'the release lands in the library');
select is((select count(*) from release_reminders where user_id = '00000000-0000-0000-0000-0000000010a2'), 0::bigint,
  'and the reminder is gone');

select * from finish();
rollback;
