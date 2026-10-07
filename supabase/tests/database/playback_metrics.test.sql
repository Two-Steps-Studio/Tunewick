-- Playback telemetry (M11).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

delete from private.playback_metrics;
insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-0000000008a1', 'pm-listener@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000008a2', 'pm-admin@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
select system_grant_role('pm-admin@test.local', 'admin');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok($$select report_playback('started', 'high', 'mse', 'chrome', 400)$$, '42501', null,
  'anonymous players do not report');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000008a1", "role": "authenticated"}';
select lives_ok($$select report_playback('started', 'high', 'mse', 'chrome', 400)$$, 'a start is reported');
select report_playback('started', 'high', 'mse', 'firefox', 800);
select report_playback('started', 'high', 'native', 'safari', 1200);
select report_playback('error', 'lossless', 'mse', 'safari', null, 'stream_error');
select throws_ok($$select report_playback('started', 'high', 'mse', 'netscape', 400)$$, '22023', null, 'values are checked');
select throws_ok($$select * from private.playback_metrics$$, '42501', null, 'metrics are not readable by listeners');

reset role;
select is((select count(*)::int from private.playback_metrics where first_audio_ms is not null), 3,
  'stored without any user id (the table has no such column)');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000008a2", "role": "authenticated", "aal": "aal2"}';
select is((select starts || ':' || first_audio_p50_ms || ':' || errors from admin_playback_summary() where tier = 'high'), '3:800:0',
  'admins see starts and the median time to first audio per tier');
select is((select errors || ':' || top_error from admin_playback_summary() where tier = 'lossless'), '1:stream_error',
  'and errors with the most common code');

select * from finish();
rollback;
