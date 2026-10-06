-- Library: likes and follows (M5.1).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000c1', 'lib-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'lib-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'lib-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Biblioteka Test', 'biblioteka-test-lt'));
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'artist'), 'jawne', 'Jawne', 'single'),
  ((select id from ids where name = 'artist'), 'szkic', 'Szkic', 'single');
insert into ids select 'public', id from releases where slug = 'jawne' and artist_id = (select id from ids where name = 'artist');
insert into ids select 'draft', id from releases where slug = 'szkic' and artist_id = (select id from ids where name = 'artist');
insert into ids values ('track', add_track((select id from ids where name = 'public'), 'Utwór'));
insert into ids values ('draft_track', add_track((select id from ids where name = 'draft'), 'Szkic utworu'));

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day' where id = (select id from ids where name = 'public');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}';
select lives_ok($$insert into track_likes (track_id) values ((select id from ids where name = 'track'))$$, 'a listener likes a public track');
select lives_ok($$insert into release_likes (release_id) values ((select id from ids where name = 'public'))$$, 'and a public release');
select lives_ok($$insert into artist_follows (artist_id) values ((select id from ids where name = 'artist'))$$, 'and follows the artist');
select throws_ok($$insert into release_likes (release_id) values ((select id from ids where name = 'draft'))$$,
  '42501', null, 'drafts cannot be liked');
select throws_ok($$insert into track_likes (track_id) values ((select id from ids where name = 'draft_track'))$$,
  '42501', null, 'nor their tracks');
select throws_ok($$insert into track_likes (user_id, track_id) values ('00000000-0000-0000-0000-0000000000c3', (select id from ids where name = 'track'))$$,
  '42501', null, 'nobody likes on someone else''s behalf');
select is((select count(*)::int from track_likes), 1, 'the listener sees their like');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated"}';
select is((select count(*)::int from track_likes) + (select count(*)::int from artist_follows), 0, 'likes and follows are private');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is(artist_follower_count((select id from ids where name = 'artist')), 1, 'the follower count is public and real');
select throws_ok($$select * from artist_follows$$, '42501', null, 'but who follows is not');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}';
delete from artist_follows where artist_id = (select id from ids where name = 'artist');
select is(artist_follower_count((select id from ids where name = 'artist')), 0, 'unfollowing lowers it');
select throws_ok($$insert into track_likes (track_id) values ((select id from ids where name = 'track'))$$,
  '23505', null, 'a track is liked once');

select * from finish();
rollback;
