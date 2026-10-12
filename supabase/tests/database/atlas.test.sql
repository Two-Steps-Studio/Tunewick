-- M14.10: the atlas — countries, cities, scenes from public catalogue facts.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-000000000aa1', 'atlas-a@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000aa2', 'atlas-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000aa1", "role": "authenticated"}';
insert into ids values ('published', create_artist('Wydana', 'atlas-wydana'));
insert into ids values ('draft', create_artist('Szkic', 'atlas-szkic'));

set local role postgres;
update artists set country_code = 'IS', city = 'reykjavík' where id in (select id from ids);
insert into releases (artist_id, slug, title, type, status)
values ((select id from ids where name = 'published'), 'atlas', 'Atlas', 'single', 'published'),
       ((select id from ids where name = 'draft'), 'atlas-draft', 'Szkic', 'single', 'draft');
insert into ids select 'release', id from releases where slug = 'atlas';
insert into ids values ('track', gen_random_uuid());
insert into tracks (id, release_id, title, track_number) values ((select id from ids where name = 'track'), (select id from ids where name = 'release'), 'Jeden', 1);
insert into listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, soundcheck)
values ('00000000-0000-0000-0000-000000000aa2', (select id from ids where name = 'track'), (select id from ids where name = 'release'),
  (select id from ids where name = 'published'), now() - interval '1 day', 200000, true, false);
select private.refresh_charts();

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select artists from atlas_countries() where country_code = 'IS'), 1, 'only artists with published music count');
select is((select listeners_7d from atlas_countries() where country_code = 'IS'), null, 'one listener is below the floor');
select is((select discovered from atlas_countries() where country_code = 'IS'), false, 'visitors have discovered nothing');
select is(atlas_country('is')->'cities'->0->>'city', 'Reykjavík', 'cities grouped and capitalised');
select is(atlas_country('XX'), null, 'no such country, no page');
select is(jsonb_array_length(atlas_city('IS', 'Reykjavík')->'artists'), 1, 'the city scene lists its artists');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000aa2", "role": "authenticated"}';
select ok((select discovered from atlas_countries() where country_code = 'IS'), 'a listener sees the countries they heard');
select is(atlas_city('IS', 'Akureyri'), null, 'an empty city has no page');

select * from finish();
rollback;
