-- Account deletion (M11).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000007a1', 'del-owner@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007a2', 'del-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007a3', 'del-staff@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007a4', 'del-coowner@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
update profiles set handle = 'del-owner-test' where id = '00000000-0000-0000-0000-0000000007a1';
select system_grant_role('del-staff@test.local', 'moderator');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

-- The owner runs a solo artist profile and co-owns a band (invited by the co-owner).
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
insert into ids values ('solo', create_artist('Solo Usuwany', 'solo-usuwany-del'));
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a4", "role": "authenticated"}';
insert into ids values ('band', create_artist('Zespół Wspólny', 'zespol-wspolny-del'));
select invite_artist_member((select id from ids where name = 'band'), 'del-owner-test', 'owner');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
select accept_artist_membership((select id from ids where name = 'band'));
insert into releases (artist_id, slug, title, type) values ((select id from ids where name = 'band'), 'ep', 'EP', 'single');
insert into ids select 'release', id from releases where slug = 'ep' and artist_id = (select id from ids where name = 'band');
insert into ids values ('track', add_track((select id from ids where name = 'release'), 'Utwór'));
insert into rights_declarations (release_id, owns_master, controls_composition, cmo_memberships, samples, ai_content, territories, terms_version)
values ((select id from ids where name = 'release'), true, true, '{none}', 'none', 'human', '{PL}', 'test');
set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day' where id = (select id from ids where name = 'release');

-- A fan with a library.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a2", "role": "authenticated"}';
insert into track_likes (track_id) values ((select id from ids where name = 'track'));
insert into playlists (title) values ('Moja');
select record_listen((select id from ids where name = 'track'), now() - interval '1 minute', 30000);

select throws_ok($$select delete_my_account('inny@test.local')$$, '22023', null, 'the email must match');
select lives_ok($$select delete_my_account(' DEL-FAN@test.local ')$$, 'a listener deletes their account');

set local role postgres;
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000007a2'), 0, 'the account is gone');
select is((select count(*)::int from track_likes where user_id = '00000000-0000-0000-0000-0000000007a2')
  + (select count(*)::int from playlists where owner_id = '00000000-0000-0000-0000-0000000007a2')
  + (select count(*)::int from listening_events where user_id = '00000000-0000-0000-0000-0000000007a2')
  + (select count(*)::int from profiles where id = '00000000-0000-0000-0000-0000000007a2'), 0,
  'with likes, playlists, history and profile');
select is((select count(*)::int from private.audit_log where action = 'account.delete'
  and subject_id = '00000000-0000-0000-0000-0000000007a2' and before is null and after is null), 1,
  'audited without personal data');

-- The sole owner of an artist profile must transfer or delete it first; co-owned bands do not block.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
select is((select array_agg(name) from my_deletion_blockers()), array['Solo Usuwany'],
  'only the solo profile blocks (the band has another owner)');
select throws_ok($$select delete_my_account('del-owner@test.local')$$, '55000', 'transfer or delete your artist profiles first',
  'a sole owner cannot delete the account yet');

set local role postgres;
delete from artists where id = (select id from ids where name = 'solo');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
select is((select count(*)::int from my_deletion_blockers()), 0, 'no blockers once the solo profile is gone');
select lives_ok($$select delete_my_account('del-owner@test.local')$$, 'then the owner deletes the account');

set local role postgres;
select is((select count(*)::int from rights_declarations where release_id = (select id from ids where name = 'release')
  and declared_by is null), 1, 'the rights declaration stays as evidence, without the person');
select is((select count(*)::int from artist_members where artist_id = (select id from ids where name = 'band')), 1,
  'the band keeps its other owner');
select is((select status::text from releases where id = (select id from ids where name = 'release')), 'published',
  'and its music stays published');

-- Staff accounts are removed by an administrator, not by themselves.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a3", "role": "authenticated"}';
select throws_ok($$select delete_my_account('del-staff@test.local')$$, '55000', 'staff accounts are removed by an administrator',
  'staff accounts are not self-deleted');

select * from finish();
rollback;
