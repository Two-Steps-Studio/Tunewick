-- Rights declaration rules (M2.4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000000b1', 'b1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Prawa', 'prawa-test'));
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'singiel', 'Singiel', 'single');
insert into ids values ('release', (select id from releases where slug = 'singiel'
  and artist_id = (select id from ids where name = 'artist')));

select throws_ok(
  $$insert into rights_declarations (release_id, owns_master, controls_composition, cmo_memberships,
      samples, ai_content, territories, terms_version)
    values ((select id from ids where name = 'release'), true, true, array['none'], 'cleared',
      'human', array['WORLD'], 't')$$,
  '23514', null, 'cleared samples need a description');

select throws_ok(
  $$insert into rights_declarations (release_id, owns_master, controls_composition, cmo_memberships,
      samples, ai_content, territories, terms_version)
    values ((select id from ids where name = 'release'), true, true, '{}', 'none',
      'human', array['WORLD'], 't')$$,
  '23514', null, 'membership question must be answered');

select throws_ok(
  $$insert into rights_declarations (release_id, owns_master, controls_composition, cmo_memberships,
      samples, ai_content, territories, terms_version)
    values ((select id from ids where name = 'release'), true, true, array['none', 'zaiks'], 'none',
      'human', array['WORLD'], 't')$$,
  '23514', null, '"none" cannot be combined with an organization');

select lives_ok(
  $$insert into rights_declarations (release_id, owns_master, controls_composition, cmo_memberships,
      samples, samples_description, ai_content, territories, terms_version)
    values ((select id from ids where name = 'release'), true, false, array['zaiks', 'stoart'], 'cleared',
      'Sample z nagrania terenowego, licencja od autora', 'ai_assisted', array['PL'], 't')$$,
  'a complete declaration with ZAiKS membership and cleared samples is stored');

select is(
  (select declared_by from rights_declarations where release_id = (select id from ids where name = 'release')),
  '00000000-0000-0000-0000-0000000000b1'::uuid, 'declared_by is the signed-in member');

select is(
  (select ai_content::text from releases where id = (select id from ids where name = 'release')),
  'ai_assisted', 'the declaration updates the release AI value');

select * from finish();
rollback;
