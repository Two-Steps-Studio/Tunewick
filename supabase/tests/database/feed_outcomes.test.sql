-- Discover weight tuning input: per reason, what the listener did with what they were shown.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000000c1', 'fo-ala@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'fo-bartek@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
select record_events('[
  {"name": "song_impression", "track": "10000000-0000-0000-0000-000000000001", "reason": "genre_you_like"},
  {"name": "song_impression", "track": "10000000-0000-0000-0000-000000000001", "reason": "genre_you_like"},
  {"name": "song_impression", "track": "10000000-0000-0000-0000-000000000002", "reason": "genre_you_like"},
  {"name": "song_saved", "track": "10000000-0000-0000-0000-000000000001", "reason": "genre_you_like"},
  {"name": "song_liked", "track": "10000000-0000-0000-0000-000000000001", "reason": "genre_you_like"},
  {"name": "preview_completed", "track": "10000000-0000-0000-0000-000000000002", "reason": "genre_you_like"},
  {"name": "song_impression", "track": "10000000-0000-0000-0000-000000000003", "reason": "popular"},
  {"name": "song_skipped", "track": "10000000-0000-0000-0000-000000000003", "reason": "popular"},
  {"name": "song_impression", "track": "10000000-0000-0000-0000-000000000004", "reason": "shared"}
]');

select is(
  (select row(shown, hits, completes, skips)::text from my_feed_outcomes() where reason = 'genre_you_like'),
  '(2,1,1,0)', 'distinct songs shown, kept (one song liked and saved counts once) and finished');
select is((select skips from my_feed_outcomes() where reason = 'popular'), 1, 'skips are counted');
select is((select count(*)::int from my_feed_outcomes() where reason = 'shared'), 0,
  'a shared link the listener opened is not a recommendation');

set local role postgres;
update private.product_events set created_at = now() - interval '61 days'
where user_id = '00000000-0000-0000-0000-0000000000c1' and reason = 'popular';
set local role authenticated;
select is((select count(*)::int from my_feed_outcomes() where reason = 'popular'), 0, 'only the last 60 days count');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}';
select is((select count(*)::int from my_feed_outcomes()), 0, 'only your own events');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select * from my_feed_outcomes()$$, '42501', null, 'visitors have no outcomes');

select * from finish();
rollback;
