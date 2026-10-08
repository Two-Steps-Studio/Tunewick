-- Follows, activity visibility and blocking (M8.2).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000009a1', 'so-ala@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009a2', 'so-bob@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009a3', 'so-cyd@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

-- Ala went to a published, past event and has one public and one private playlist.
insert into public.venues (id, slug, name, city, voivodeship)
values ('00000000-0000-0000-0000-0000000009b1', 'so-klub', 'Klub Social', 'Katowice', 'slaskie');
insert into public.artists (id, slug, name)
values ('00000000-0000-0000-0000-0000000009d1', 'social-test-band', 'Social Test Band');
insert into public.events (id, title, starts_at, venue_id, status, artist_id)
values ('00000000-0000-0000-0000-0000000009c1', 'Koncert Social', now() - interval '2 days',
  '00000000-0000-0000-0000-0000000009b1', 'published', '00000000-0000-0000-0000-0000000009d1');
insert into public.event_attendance (user_id, event_id)
values ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009c1');
insert into public.playlists (owner_id, title, visibility)
values ('00000000-0000-0000-0000-0000000009a1', 'Publiczna', 'public'),
       ('00000000-0000-0000-0000-0000000009a1', 'Prywatna', 'private');

-- Anonymous visitors: default visibility is followers, so nothing.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from profile_attended_events('00000000-0000-0000-0000-0000000009a1')), 0,
  'activity is hidden from visitors by default (followers)');
select is((select followers from profile_relationship('00000000-0000-0000-0000-0000000009a1')), 0,
  'counts are real and visible');

-- Bob follows Ala and now sees her activity, but never the private playlist.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000009a2", "role": "authenticated"}';
select is((select count(*)::int from profile_attended_events('00000000-0000-0000-0000-0000000009a1')), 0,
  'not before following');
select lives_ok($$insert into user_follows (followee_id) values ('00000000-0000-0000-0000-0000000009a1')$$,
  'a listener follows another listener');
select is((select title from profile_attended_events('00000000-0000-0000-0000-0000000009a1')), 'Koncert Social',
  'followers see "Byłem przy tym"');
select is((select array_agg(title) from profile_playlists('00000000-0000-0000-0000-0000000009a1')), array['Publiczna'],
  'and public playlists only');
select throws_ok($$insert into user_follows (follower_id, followee_id) values ('00000000-0000-0000-0000-0000000009a3', '00000000-0000-0000-0000-0000000009a1')$$,
  '42501', null, 'nobody follows on behalf of someone else');
select throws_ok($$insert into user_follows (followee_id) values ('00000000-0000-0000-0000-0000000009a2')$$,
  '23514', null, 'nobody follows themselves');

-- Cyd does not follow: nothing.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000009a3", "role": "authenticated"}';
select is((select activity_visible from profile_relationship('00000000-0000-0000-0000-0000000009a1')), false,
  'non-followers do not see followers-only activity');
select is((select count(*)::int from user_follows), 0, 'other people''s follows are not readable');

-- Ala makes activity public, then blocks Bob.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000009a1", "role": "authenticated"}';
update profile_settings set activity_visibility = 'public' where user_id = '00000000-0000-0000-0000-0000000009a1';
select is((select count(*)::int from user_follows where followee_id = '00000000-0000-0000-0000-0000000009a1'), 1,
  'people see who follows them');
insert into user_blocks (blocked_id) values ('00000000-0000-0000-0000-0000000009a2');
select is((select count(*)::int from user_follows), 0, 'a block ends the follow');
select is((select count(*)::int from my_blocked_users()), 1, 'the blocked list is readable by the blocker');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000009a2", "role": "authenticated"}';
select is((select count(*)::int from profile_attended_events('00000000-0000-0000-0000-0000000009a1')), 0,
  'a blocked person does not see even public activity');
select throws_ok($$insert into user_follows (followee_id) values ('00000000-0000-0000-0000-0000000009a1')$$,
  '42501', null, 'and cannot follow again');
select is((select count(*)::int from user_blocks), 0, 'blocks are private to the blocker');

select * from finish();
rollback;
