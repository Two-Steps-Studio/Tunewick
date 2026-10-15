-- Error reports: grouped per error and day, capped per day, readable by admins only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select lives_ok($$select report_error('client', 'Boom', E'Error: Boom\n    at f (app.js:10:5)', '/szukaj?q=jan.kowalski@example.com')$$,
  'anyone can report');
select report_error('client', 'Boom', E'Error: Boom\n    at f (app.js:12:7)', '/szukaj');
select throws_ok($$select report_error('db', 'x')$$, '22023', 'invalid error report', 'only known sources');

set local role postgres;
select is((select count from private.app_errors where message = 'Boom'), 2,
  'the same error (line numbers aside) is one row with a count');
select is((select path from private.app_errors where message = 'Boom'), '/szukaj',
  'the query string is never stored');

insert into private.app_errors (fingerprint, source, message)
select 'filler-' || n, 'server', 'filler' from generate_series(1, 600) n;
set local role anon;
select report_error('server', 'One too many');
set local role postgres;
select is((select count(*) from private.app_errors where message = 'One too many'), 0::bigint,
  'no new kinds of error past the daily cap');

set local role anon;
select throws_ok($$select * from admin_app_errors(7)$$, '42501', null, 'visitors cannot read reports');

select * from finish();
rollback;
