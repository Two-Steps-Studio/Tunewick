-- Reports, takedowns and appeals (M10.2).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000003a1', 'rt-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000003a2', 'rt-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000003a3', 'rt-mod1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000003a4', 'rt-mod2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000003a5', 'rt-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
select system_grant_role('rt-mod1@test.local', 'moderator');
select system_grant_role('rt-mod2@test.local', 'moderator');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000003a1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Zgłoszenia Test', 'zgloszenia-test-rt'));
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'artist'), 'cudze', 'Cudze', 'single'),
  ((select id from ids where name = 'artist'), 'szkic', 'Szkic', 'single');
insert into ids select 'release', id from releases where slug = 'cudze' and artist_id = (select id from ids where name = 'artist');
insert into ids select 'draft', id from releases where slug = 'szkic' and artist_id = (select id from ids where name = 'artist');
set local role postgres;
update releases set status = 'published', publish_at = now() - interval '1 day' where id = (select id from ids where name = 'release');

-- Reporting.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select submit_report('release', (select id from ids where name = 'release'), 'spam', 'To jest spam, nie muzyka.')$$,
  '42501', null, 'reports need an account');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000003a2", "role": "authenticated"}';
select throws_ok($$select submit_report('release', (select id from ids where name = 'draft'), 'spam', 'To jest spam, nie muzyka.')$$,
  'P0002', null, 'only public content can be reported');
select throws_ok($$select submit_report('release', (select id from ids where name = 'release'), 'copyright', 'To moje nagranie, nie ich.')$$,
  '22023', null, 'a copyright notice needs the claimant and a good-faith statement');
select lives_ok($$select submit_report('release', (select id from ids where name = 'release'), 'copyright', 'To moje nagranie, nie ich.',
  'Jan Kowalski', 'jan@example.com', true)$$, 'a complete copyright notice is accepted');
select throws_ok($$select submit_report('release', (select id from ids where name = 'release'), 'spam', 'Jeszcze raz to samo zgłoszenie.')$$,
  '23505', null, 'one open report per person and subject');
select is((select count(*)::int from reports), 1, 'the reporter sees their report');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000003a5", "role": "authenticated"}';
select lives_ok($$select submit_report('release', (select id from ids where name = 'release'), 'other', 'Druga osoba też to zgłasza.')$$,
  'another person reports the same release');
select is((select count(*)::int from reports), 1, 'reports are private to their author');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000003a1", "role": "authenticated"}';
select is((select count(*)::int from reports), 0, 'the reported artist does not see who reported');

-- Decision with a statement of reasons.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000003a3", "role": "authenticated", "aal": "aal2"}';
insert into ids select 'report', id from reports where reason = 'copyright' and subject_id = (select id from ids where name = 'release');
select throws_ok($$select moderate_report((select id from ids where name = 'report'), 'takedown_release', 'Za krótko')$$,
  '22023', null, 'a decision needs a statement of reasons');
select throws_ok($$select moderate_report((select id from ids where name = 'report'), 'suspend_artist', 'Uzasadnienie wystarczająco długie.')$$,
  '22023', null, 'the action must fit the reported content');
insert into ids values ('decision', moderate_report((select id from ids where name = 'report'), 'takedown_release',
  'Wnioskodawca wykazał prawa do nagrania; wydawnictwo zdjęte do czasu wyjaśnienia.'));
select is((select status::text from releases where id = (select id from ids where name = 'release')), 'taken_down',
  'the release is taken down');
select is((select count(*)::int from reports where subject_id = (select id from ids where name = 'release') and status = 'actioned'), 2,
  'every open report about it is closed by the decision');
select is(artist_copyright_strikes((select id from ids where name = 'artist')), 1, 'moderators see the copyright strike');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is(release_is_public((select id from ids where name = 'release')), false, 'listeners no longer get it');

-- The artist reads the statement and appeals; a different moderator reverses.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000003a1", "role": "authenticated"}';
select is((select statement from moderation_decisions where id = (select id from ids where name = 'decision')),
  'Wnioskodawca wykazał prawa do nagrania; wydawnictwo zdjęte do czasu wyjaśnienia.', 'the artist sees the statement of reasons');
select lives_ok($$select appeal_moderation_decision((select id from ids where name = 'decision'), 'Mamy umowę licencyjną z wytwórnią — w załączeniu numer.')$$,
  'the artist appeals');
select throws_ok($$select appeal_moderation_decision((select id from ids where name = 'decision'), 'Drugie odwołanie w tej samej sprawie.')$$,
  '55000', null, 'once');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000003a3", "role": "authenticated", "aal": "aal2"}';
select throws_ok($$select decide_appeal((select id from ids where name = 'decision'), 'reverse', 'Umowa licencyjna potwierdzona przez wytwórnię.')$$,
  '42501', null, 'the moderator who decided cannot decide the appeal');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000003a4", "role": "authenticated", "aal": "aal2"}';
select lives_ok($$select decide_appeal((select id from ids where name = 'decision'), 'reverse', 'Umowa licencyjna potwierdzona przez wytwórnię.')$$,
  'another moderator reverses');
select is((select status::text from releases where id = (select id from ids where name = 'release')), 'published',
  'the release is back');
select is(artist_copyright_strikes((select id from ids where name = 'artist')), 0, 'a reversed takedown is not a strike');

select * from finish();
rollback;
