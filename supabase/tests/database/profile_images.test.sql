-- Profile pictures: only your own, attached when processed, public on a visible profile, files
-- swept when removed.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

update images set status = 'failed' where status in ('uploaded', 'processing');

insert into auth.users (id, email, raw_app_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000007a1', 'pi-me@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000007a2', 'pi-other@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
select throws_ok(
  $$select begin_image_upload('profile_image', '00000000-0000-0000-0000-0000000007a2', 'png', 5000)$$,
  '42501', null, 'nobody uploads a picture for someone else');
insert into ids values ('pic',
  (select id from begin_image_upload('profile_image', '00000000-0000-0000-0000-0000000007a1', 'png', 5000)));
select matches((select object_key from images where id = (select id from ids where name = 'pic')),
  '^images/profile_image/', 'your own picture starts an upload');
select complete_image_upload((select id from ids where name = 'pic'));

set local role service_role;
select is((select kind::text from claim_image_upload()), 'profile_image', 'the worker gets it');
select is(finish_image_upload((select id from ids where name = 'pic'),
  '{"status": "accepted", "width": 400, "height": 400, "dominant_color": "#112233",
    "variants": [{"width": 96, "key": "images/pi/96.webp", "bytes": 2000}]}'),
  'accepted', 'the processed picture is accepted');

set local role anon;
select is((select image_id from profiles where id = '00000000-0000-0000-0000-0000000007a1'),
  (select id from ids where name = 'pic'), 'it is attached to the profile');
select is((select count(*)::int from images where id = (select id from ids where name = 'pic')), 1,
  'anyone can see the picture of a visible profile');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000007a1", "role": "authenticated"}';
select remove_profile_image();
reset role;
select is((select image_id from profiles where id = '00000000-0000-0000-0000-0000000007a1'), null,
  'removing it detaches it');
select ok(exists (select 1 from private.storage_deletions where object_key = 'images/pi/96.webp')
  and exists (select 1 from private.storage_deletions d join ids on true
    where ids.name = 'pic' and d.bucket = 'ingest' and d.object_key like 'images/profile_image/%'),
  'and its files go to the storage sweep');

select * from finish();
rollback;
