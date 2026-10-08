-- Artist verification review (M10.1).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000002a1', 'vr-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000002a2', 'vr-mod@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
select system_grant_role('vr-mod@test.local', 'moderator');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000002a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Weryfikacja Test', 'weryfikacja-test-vr'));
insert into ids values ('request', request_artist_verification((select id from ids where name = 'artist'),
  '["https://bandcamp.com/weryfikacja"]'::jsonb, 'Nasz Bandcamp'));
select is((select verification_status::text from artists where id = (select id from ids where name = 'artist')), 'pending',
  'a request makes the profile pending');
select throws_ok($$select review_artist_verification((select id from ids where name = 'request'), 'approve')$$,
  '42501', null, 'the artist cannot approve themselves');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000002a2", "role": "authenticated", "aal": "aal1"}';
select throws_ok($$select review_artist_verification((select id from ids where name = 'request'), 'approve')$$,
  '42501', 'multi-factor authentication required', 'moderators need MFA');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000002a2", "role": "authenticated", "aal": "aal2"}';
select is((select count(*)::int from artist_verification_requests where id = (select id from ids where name = 'request')), 1,
  'moderators see the request and its evidence');
select throws_ok($$select review_artist_verification((select id from ids where name = 'request'), 'reject', 'nie')$$,
  '22023', null, 'a rejection needs a reason');
select lives_ok($$select review_artist_verification((select id from ids where name = 'request'), 'reject', 'Link nie prowadzi do profilu zespołu.')$$,
  'the moderator rejects with a reason');
select throws_ok($$select review_artist_verification((select id from ids where name = 'request'), 'approve')$$,
  '55000', null, 'a decided request cannot be decided again');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000002a1", "role": "authenticated"}';
select is((select status || ':' || decision_note from artist_verification_requests where id = (select id from ids where name = 'request')),
  'rejected:Link nie prowadzi do profilu zespołu.', 'the artist sees why');
insert into ids values ('second', request_artist_verification((select id from ids where name = 'artist'),
  '["https://instagram.com/weryfikacja"]'::jsonb, null));

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000002a2", "role": "authenticated", "aal": "aal2"}';
select review_artist_verification((select id from ids where name = 'second'), 'approve');
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select verification_status::text from artists where id = (select id from ids where name = 'artist')), 'verified',
  'after a new request and approval the profile is verified');

reset role;
select is((select count(*)::int from private.audit_log where subject_id = (select id::text from ids where name = 'artist')
  and action like 'artist.verification_%'), 2, 'both decisions are audited');

select * from finish();
rollback;
