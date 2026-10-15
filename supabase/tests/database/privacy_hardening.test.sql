-- Privacy hardening: mutual "followers", private profiles, unlisted playlists, leaderboard.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email, raw_app_meta_data, aud, role, created_at)
values
  ('00000000-0000-0000-0000-0000000005b1', 'ph-owner@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000005b2', 'ph-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000005b3', 'ph-friend@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated', now());
update profile_settings set activity_visibility = 'followers'
  where user_id = '00000000-0000-0000-0000-0000000005b1';
insert into user_follows (follower_id, followee_id) values
  ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000005b1'),
  ('00000000-0000-0000-0000-0000000005b3', '00000000-0000-0000-0000-0000000005b1'),
  ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005b3');
insert into playlists (id, owner_id, title, visibility) values
  ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b1', 'Shared', 'public'),
  ('00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005b1', 'Link only', 'unlisted'),
  ('00000000-0000-0000-0000-0000000005c3', '00000000-0000-0000-0000-0000000005b1', 'Mine', 'private');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005b2", "role": "authenticated"}';
select ok(not private.can_view_activity('00000000-0000-0000-0000-0000000005b1'),
  'a one-sided follower does not count as a follower');
select ok(not private.can_view('00000000-0000-0000-0000-0000000005b1', 'followers'), 'nor for other levels');
set local role authenticated;
select is((select count(*)::integer from playlists where owner_id = '00000000-0000-0000-0000-0000000005b1'), 0,
  'playlists of someone who does not share activity are not listed');
select is(open_playlist('00000000-0000-0000-0000-0000000005c2') ->> 'title', 'Link only', 'an unlisted playlist opens by id');
select is(open_playlist('00000000-0000-0000-0000-0000000005c3'), null, 'a private one does not');

reset role;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005b3", "role": "authenticated"}';
select ok(private.can_view_activity('00000000-0000-0000-0000-0000000005b1'), 'mutual follows see followers-only activity');
set local role authenticated;
select is((select array_agg(title order by title) from playlists where owner_id = '00000000-0000-0000-0000-0000000005b1'),
  array['Shared'], 'only public playlists are listed, never unlisted ones');

reset role;
update profile_settings set profile_public = false where user_id = '00000000-0000-0000-0000-0000000005b1';
select ok(not private.can_view_activity('00000000-0000-0000-0000-0000000005b1'), 'a private profile hides activity from friends too');

reset role;
update profile_settings set profile_public = true, activity_visibility = 'public' where user_id = '00000000-0000-0000-0000-0000000005b1';
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::integer from playlists where owner_id = '00000000-0000-0000-0000-0000000005b1'), 1,
  'visitors list public playlists of people who share activity');
select is((select count(*)::integer from playlists where visibility = 'unlisted'), 0, 'visitors cannot list unlisted playlists');
select is(open_playlist('00000000-0000-0000-0000-0000000005c2') ->> 'visibility', 'unlisted', 'but open them with the link');

reset role;
insert into user_blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005b2');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000005b2", "role": "authenticated"}';
select is(open_playlist('00000000-0000-0000-0000-0000000005c2'), null, 'a blocked person cannot open the link');

select * from finish();
rollback;
