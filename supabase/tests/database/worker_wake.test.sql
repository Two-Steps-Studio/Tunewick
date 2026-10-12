-- Waking the audio worker when there is work.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

select ok(not private.wake_worker(), 'without a URL nothing is sent');
select throws_ok($$ update private.worker_wake set url = 'http://insecure.example' $$, '23514', null, 'only https URLs');

update private.worker_wake set url = 'https://tunewick-audio.example/wake', last_sent_at = null;
select ok(private.wake_worker(), 'the first wake is sent');
select ok(not private.wake_worker(), 'a second one within 20 seconds is not');
select ok(private.wake_worker(true), 'the hourly wake always is');

update private.worker_wake set last_sent_at = now() - interval '1 minute';
insert into private.storage_deletions (bucket, object_key) values ('media', 'a'), ('media', 'b');
select ok((select last_sent_at > now() - interval '5 seconds' from private.worker_wake), 'new storage deletions wake the worker');

set local role authenticated;
select throws_ok($$ select private.wake_worker() $$, '42501', null, 'listeners cannot send wakes');

select * from finish();
rollback;
