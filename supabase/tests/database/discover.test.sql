-- Discover home (M6.3).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

-- Only this test's rows count: everything else is hidden inside the transaction.
update releases set status = 'draft' where status = 'published';

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values ('00000000-0000-0000-0000-0000000000d9', 'd9@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d9", "role": "authenticated"}';
insert into ids values
  ('podlasie', create_artist('Suwalska Fala', 'suwalska-fala-dt')),
  ('slask', create_artist('Hałda Kolektyw', 'halda-kolektyw-dt'));
update artists set voivodeship = 'podlaskie', city = 'Suwałki' where id = (select id from ids where name = 'podlasie');
update artists set voivodeship = 'slaskie', city = 'Bytom' where id = (select id from ids where name = 'slask');
insert into releases (artist_id, slug, title, type) values
  ((select id from ids where name = 'podlasie'), 'pierwsza', 'Pierwsza', 'single'),
  ((select id from ids where name = 'podlasie'), 'druga', 'Druga', 'ep'),
  ((select id from ids where name = 'slask'), 'debiut', 'Debiut', 'album'),
  ((select id from ids where name = 'slask'), 'szkic', 'Szkic', 'single');

set local role postgres;
update releases set status = 'published', publish_at = now() - interval '20 days'
where slug = 'pierwsza' and artist_id = (select id from ids where name = 'podlasie');
update releases set status = 'published', publish_at = now() - interval '2 days'
where slug = 'druga' and artist_id = (select id from ids where name = 'podlasie');
update releases set status = 'published', publish_at = now() - interval '5 days'
where slug = 'debiut' and artist_id = (select id from ids where name = 'slask');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is((select array_agg(title order by publish_at desc) from discover_releases()),
  array['Druga', 'Debiut'], 'newest first, one release per artist');
select is((select is_debut from discover_releases() where title = 'Debiut'), true,
  'an artist''s only release is a debut');
select is((select is_debut from discover_releases() where title = 'Druga'), false,
  'a second release is not a debut');
select is((select count(*)::int from discover_releases() where title = 'Szkic'), 0,
  'drafts never appear');
select is((select array_agg(title) from discover_releases('slaskie')), array['Debiut'],
  'the region filter narrows to one voivodeship');
select is((select array_agg(name order by first_release_at desc) from discover_artists()),
  array['Hałda Kolektyw', 'Suwalska Fala'], 'artists ordered by their first release, newest debut first');
select is((select release_count from discover_artists() where name = 'Suwalska Fala'), 2,
  'release counts are real');
select is((select count(*)::int from discover_artists('mazowieckie')), 0,
  'an empty region is empty, not padded');

select * from finish();
rollback;
