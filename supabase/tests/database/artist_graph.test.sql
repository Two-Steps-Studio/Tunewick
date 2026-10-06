-- Related artists (M7.2): every relation comes from public data and carries its evidence.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
select ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'graph' || n || '@test.local',
  '{"beta_bypass": "true"}', 'authenticated', 'authenticated'
from generate_series(1, 9) n;
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

-- Four artists, each owned by a different account.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000101", "role": "authenticated"}';
insert into ids values ('a', create_artist('Graf A', 'graf-a-gt'));
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000102", "role": "authenticated"}';
insert into ids values ('b', create_artist('Graf B', 'graf-b-gt'));
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000103", "role": "authenticated"}';
insert into ids values ('c', create_artist('Graf C', 'graf-c-gt'));
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000104", "role": "authenticated"}';
insert into ids values ('d', create_artist('Graf D', 'graf-d-gt'));
update artists set city = 'Gliwice', voivodeship = 'slaskie' where id = (select id from ids where name = 'd');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000101", "role": "authenticated"}';
update artists set city = 'gliwice', voivodeship = 'slaskie' where id = (select id from ids where name = 'a');

-- A's single credits B as a performer and Jan Kowalski as producer; C's single has the same producer.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000101", "role": "authenticated"}';
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'a'), 'a1', 'A1', 'single');
insert into ids select 'ra', id from releases where slug = 'a1' and artist_id = (select id from ids where name = 'a');
insert into ids values ('ta', add_track((select id from ids where name = 'ra'), 'Wspólny'));
insert into credits (track_id, name, role, artist_id) values
  ((select id from ids where name = 'ta'), 'Graf B', 'performer', (select id from ids where name = 'b')),
  ((select id from ids where name = 'ta'), 'Jan Kowalski', 'producer', null),
  ((select id from ids where name = 'ta'), 'Ala Zet', 'mastering_engineer', null);
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000103", "role": "authenticated"}';
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'c'), 'c1', 'C1', 'single');
insert into ids select 'rc', id from releases where slug = 'c1' and artist_id = (select id from ids where name = 'c');
insert into ids values ('tc', add_track((select id from ids where name = 'rc'), 'Inny'));
insert into credits (track_id, name, role) values
  ((select id from ids where name = 'tc'), 'JAN KOWALSKI', 'producer'),
  ((select id from ids where name = 'tc'), 'Ala Zet', 'mastering_engineer');
-- B and D have public music too (a related artist must have something to hear).
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000102", "role": "authenticated"}';
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'b'), 'b1', 'B1', 'single');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000104", "role": "authenticated"}';
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'd'), 'd1', 'D1', 'single');

reset role;
select is((select count(*)::int from graph_edges where src_id in (select id from ids)), 0, 'drafts create no relations');
update releases set status = 'published', publish_at = now() - interval '1 day'
where artist_id in (select id from ids where name in ('a', 'b', 'c', 'd'));

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select relation from related_artists((select id from ids where name = 'a')) where name = 'Graf B'), 'collaborated',
  'a credited artist is a collaborator');
select is((select evidence ->> 'track' from related_artists((select id from ids where name = 'b')) where name = 'Graf A'), 'Wspólny',
  'in both directions, with the track as evidence');
select is((select relation || ':' || (evidence ->> 'name') from related_artists((select id from ids where name = 'a')) where name = 'Graf C'),
  'shared_credit:Ala Zet', 'the same person links two artists (case and accents ignored)');
select is((select evidence ->> 'role' from related_artists((select id from ids where name = 'a')) where name = 'Graf C'),
  'mastering_engineer', 'and the reason names the role that person really had');
select is((select relation from related_artists((select id from ids where name = 'a')) where name = 'Graf D'), 'same_city',
  'the same city is a (weak) relation');
select is((select array_agg(name order by score desc) from related_artists((select id from ids where name = 'a'))),
  array['Graf B', 'Graf C', 'Graf D'], 'collaboration ranks above shared people above a shared city');

-- Audience overlap counts only from three shared followers on.
reset role;
insert into artist_follows (user_id, artist_id)
select ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, x.id
from generate_series(5, 6) n, (select id from ids where name in ('b', 'd')) x;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select isnt((select relation from related_artists((select id from ids where name = 'b')) where name = 'Graf D'), 'shared_audience',
  'two shared followers are not enough');
reset role;
insert into artist_follows (user_id, artist_id)
select '00000000-0000-0000-0000-000000000107', id from ids where name in ('b', 'd');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select (evidence ->> 'followers')::int from related_artists((select id from ids where name = 'b')) where name = 'Graf D'), 3,
  'three shared followers are (a count, never who)');

-- Taking music down removes its relations.
reset role;
update releases set status = 'draft' where id = (select id from ids where name = 'rc');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from related_artists((select id from ids where name = 'a')) where name = 'Graf C'), 0,
  'unpublished music no longer relates artists');
select throws_ok($$insert into graph_edges (src_type, src_id, dst_type, dst_id, relation) values ('artist', gen_random_uuid(), 'artist', gen_random_uuid(), 'x')$$,
  '42501', null, 'nobody writes the graph directly');

select * from finish();
rollback;
