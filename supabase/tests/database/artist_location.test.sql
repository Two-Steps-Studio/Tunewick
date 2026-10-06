-- Artist location (M6.1).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000b7', 'b7@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b8', 'b8@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b7", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Z Rzeszowa', 'z-rzeszowa-test'));

select lives_ok(
  $$update artists set voivodeship = 'podkarpackie', city = 'Rzeszów' where id = (select id from ids where name = 'artist')$$,
  'the owner sets the location');
select is((select city || ' / ' || voivodeship::text from artists where id = (select id from ids where name = 'artist')),
  'Rzeszów / podkarpackie', 'the location is stored');
select throws_ok(
  $$update artists set city = '   ' where id = (select id from ids where name = 'artist')$$,
  '23514', null, 'a blank city is refused');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b8", "role": "authenticated"}';
update artists set city = 'Gdzieś' where id = (select id from ids where name = 'artist');
select is((select city from artists where id = (select id from ids where name = 'artist')), 'Rzeszów',
  'others cannot change it');

select * from finish();
rollback;
