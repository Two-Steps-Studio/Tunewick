-- Catalog search (M6.2).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000000c9', 'c9@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c9", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Łódzka Kapela Zxq', 'lodzka-kapela-zxq'));
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'artist'), 'zolta-plyta', 'Żółta Płyta Zxq', 'album'),
  ((select id from ids where name = 'artist'), 'tajne-demo', 'Tajne Demo Zxq', 'single');
insert into tracks (release_id, track_number, title)
values ((select id from releases where slug = 'zolta-plyta' and artist_id = (select id from ids where name = 'artist')), 1, 'Ćma nad Bałutami Zxq');

-- Publish the album (as staff would); the demo stays a draft.
set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 minute'
where slug = 'zolta-plyta' and artist_id = (select id from ids where name = 'artist');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is((select title from search_catalog('lodzka kapela zxq') where kind = 'artist'),
  'Łódzka Kapela Zxq', 'no Polish characters needed: "lodzka" finds "Łódzka"');
select is((select title from search_catalog('ŻÓŁTA PŁYTA zxq') where kind = 'release'),
  'Żółta Płyta Zxq', 'case and diacritics do not matter');
select is((select release_title from search_catalog('cma nad balutami zxq') where kind = 'track'),
  'Żółta Płyta Zxq', 'tracks are found and carry their release');
select is((select title from search_catalog('lodzka kapeal zxq') where kind = 'artist'),
  'Łódzka Kapela Zxq', 'a typo still finds the artist');
select is((select count(*)::int from search_catalog('tajne demo zxq')), 0,
  'drafts are never found');
select is((select count(*)::int from search_catalog('z')), 0, 'one character is not a search');
select is((select count(*)::int from search_catalog('%')), 0, 'LIKE wildcards are taken literally');

select ok(
  (select score from search_catalog('lodzka kapela zxq') where kind = 'artist')
  > coalesce((select max(score) from search_catalog('lodzka kapela zxq') where kind = 'release'), 0),
  'an exact name ranks above partial matches');

-- Members do not see their own drafts in search either.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c9", "role": "authenticated"}';
select is((select count(*)::int from search_catalog('tajne demo zxq')), 0,
  'search shows only what is public, even to the artist');

select * from finish();
rollback;
