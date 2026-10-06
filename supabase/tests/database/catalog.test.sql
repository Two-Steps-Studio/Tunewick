-- Catalog RLS and functions (M2.1): owner, invited member, outsider, moderator, anonymous.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(26);

-- Fixtures: f1 owner, f2 member, f3 outsider, f4 moderator.
insert into auth.users (id, email, raw_app_meta_data, aud, role)
select ('00000000-0000-0000-0000-0000000000f' || n)::uuid, 'f' || n || '@test.local',
       '{"beta_bypass": "true"}', 'authenticated', 'authenticated'
from generate_series(1, 4) as n;
update profiles set handle = 'basistka-f2' where id = '00000000-0000-0000-0000-0000000000f2';
insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000f4', 'moderator');

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to authenticated, anon;

-- ---------------------------------------------------------------- owner (f1)
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';

insert into ids values ('artist', create_artist('Zespół Testowy', 'zespol-testowy'));
select is(
  (select role::text from artist_members where artist_id = (select id from ids where name = 'artist')),
  'owner', 'creator becomes the owner');
select throws_ok($$select create_artist('Admin', 'admin')$$, '23514', null, 'reserved artist slug rejected');
select throws_ok(
  $$update artists set verification_status = 'verified' where slug = 'zespol-testowy'$$,
  '42501', null, 'owner cannot verify own artist');
select lives_ok(
  $$select invite_artist_member((select id from ids where name = 'artist'), 'basistka-f2', 'member')$$,
  'owner invites a member by handle');

-- ---------------------------------------------------------------- invited member (f2)
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated"}';
select throws_ok(
  $$insert into releases (artist_id, slug, title, type)
    values ((select id from ids where name = 'artist'), 'przed', 'Przed akceptacją', 'single')$$,
  '42501', null, 'invited but not accepted member cannot create releases');

select lives_ok($$select accept_artist_membership((select id from ids where name = 'artist'))$$,
  'member accepts the invitation');
insert into releases (artist_id, slug, title, type)
values ((select id from ids where name = 'artist'), 'pierwsza-epka', 'Pierwsza EPka', 'ep');
insert into ids values ('release', (select id from releases where slug = 'pierwsza-epka' and created_by = '00000000-0000-0000-0000-0000000000f2'));
select is((select status::text from releases where id = (select id from ids where name = 'release')), 'draft', 'new release is a draft');
select is((select created_by from releases where id = (select id from ids where name = 'release')),
  '00000000-0000-0000-0000-0000000000f2'::uuid, 'created_by defaults to the member');

select throws_ok(
  $$update releases set status = 'published' where id = (select id from ids where name = 'release')$$,
  '42501', null, 'members cannot change status directly');

insert into tracks (release_id, track_number, title)
values ((select id from ids where name = 'release'), 1, 'Otwarcie'),
       ((select id from ids where name = 'release'), 2, 'Zamknięcie');
select is((select count(*)::int from tracks where release_id = (select id from ids where name = 'release')),
  2, 'members add tracks to drafts');

select lives_ok(
  $$insert into rights_declarations (release_id, owns_master, controls_composition, cmo_memberships,
      samples, ai_content, territories, terms_version)
    values ((select id from ids where name = 'release'), true, true, array['none'], 'none', 'human',
      array['WORLD'], 'artist-terms-draft-1')$$,
  'member declares rights on a draft');
select throws_ok($$update rights_declarations set owns_master = false$$, '42501', null,
  'declarations cannot be changed');
select throws_ok($$delete from rights_declarations$$, '42501', null, 'declarations cannot be deleted');
select throws_ok(
  $$insert into rights_declarations (release_id, owns_master, controls_composition, samples,
      ai_content, territories, terms_version)
    values ((select id from ids where name = 'release'), true, true, 'none', 'unknown',
      array['WORLD'], 'artist-terms-draft-1')$$,
  '23514', null, 'AI content must be declared');

select throws_ok(
  $$select request_artist_verification((select id from ids where name = 'artist'), '[]'::jsonb)$$,
  '42501', null, 'plain members cannot request verification');

-- ---------------------------------------------------------------- outsider (f3)
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f3", "role": "authenticated"}';
select is((select count(*)::int from releases where id = (select id from ids where name = 'release')), 0, 'outsiders do not see drafts');
update artists set name = 'Przejęte' where slug = 'zespol-testowy';
select is((select name from artists where slug = 'zespol-testowy'), 'Zespół Testowy',
  'outsiders cannot edit artists');
select throws_ok(
  $$insert into tracks (release_id, track_number, title)
    values ((select id from ids where name = 'release'), 3, 'Obcy utwór')$$,
  '42501', null, 'outsiders cannot add tracks');

-- ---------------------------------------------------------------- moderator (f4)
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f4", "role": "authenticated"}';
select is((select count(*)::int from releases where id = (select id from ids where name = 'release')), 1, 'moderators see drafts');
select is((select count(*)::int from rights_declarations where release_id = (select id from ids where name = 'release')), 1, 'moderators see declarations');

-- ---------------------------------------------------------------- anonymous
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from releases where id = (select id from ids where name = 'release')), 0, 'anonymous visitors do not see drafts');

-- Publishing happens server-side (review flow); simulate it as the owner of the tables.
reset role;
update releases set status = 'published', publish_at = now() + interval '1 day' where id = (select id from ids where name = 'release');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from releases where id = (select id from ids where name = 'release')), 0, 'scheduled releases stay hidden');
reset role;
update releases set publish_at = now() - interval '1 minute' where id = (select id from ids where name = 'release');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from tracks where release_id = (select id from ids where name = 'release')),
  2, 'published release and its tracks are public');

-- Members cannot edit a published release.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated"}';
update releases set title = 'Zmieniona po publikacji' where id = (select id from ids where name = 'release');
select is((select title from releases where id = (select id from ids where name = 'release')), 'Pierwsza EPka',
  'published releases are not editable by members');

-- ---------------------------------------------------------------- owner again
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
select lives_ok(
  $$select request_artist_verification((select id from ids where name = 'artist'),
      '["https://bandcamp.example/zespol"]'::jsonb, 'Oficjalny profil')$$,
  'owner requests verification');
select throws_ok(
  $$set constraints all immediate; select remove_artist_member((select id from ids where name = 'artist'), '00000000-0000-0000-0000-0000000000f1')$$,
  '23514', null, 'the last owner cannot leave');

select * from finish();
rollback;
