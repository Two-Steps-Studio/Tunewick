-- Reports about gigs, venues and people (M8.3).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-000000000aa1', 'rm-artist@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000aa2', 'rm-fan@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000aa3', 'rm-mod1@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000aa4', 'rm-mod2@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000aa5', 'rm-troll@test.local', '{"beta_bypass": "true"}', 'authenticated', 'authenticated');
select system_grant_role('rm-mod1@test.local', 'moderator');
select system_grant_role('rm-mod2@test.local', 'moderator');
update profiles set handle = 'falszywy-zespol', display_name = 'Oficjalny Zespół', bio = 'Kupuj bilety tutaj'
where id = '00000000-0000-0000-0000-000000000aa5';
create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000aa1", "role": "authenticated"}';
insert into ids values ('artist', create_artist('Zgłoszenia Scena', 'zgloszenia-scena-rm'));
insert into ids values ('venue', find_or_create_venue('Klub Zgłoszeń', 'Gliwice', 'slaskie', 'ul. Prawdziwa 1', 'https://spam.example'));
insert into ids values ('event', create_event((select id from ids where name = 'artist'), 'Koncert widmo',
  (select id from ids where name = 'venue'), now() + interval '5 days'));
insert into ids values ('pending', create_event((select id from ids where name = 'artist'), 'Jeszcze w moderacji',
  (select id from ids where name = 'venue'), now() + interval '6 days'));
set local role postgres;
update events set status = 'published' where id = (select id from ids where name = 'event');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000aa2", "role": "authenticated"}';
select lives_ok($$select submit_report('event', (select id from ids where name = 'event'), 'spam', 'Ten koncert się nie odbędzie, to oszustwo.')$$,
  'a published event can be reported');
select throws_ok($$select submit_report('event', (select id from ids where name = 'pending'), 'spam', 'Ten koncert się nie odbędzie, to oszustwo.')$$,
  'P0002', null, 'an event still in moderation is not public');
select lives_ok($$select submit_report('venue', (select id from ids where name = 'venue'), 'spam', 'Link prowadzi do podejrzanej strony.')$$,
  'a venue can be reported');
select lives_ok($$select submit_report('profile', '00000000-0000-0000-0000-000000000aa5', 'impersonation', 'Podszywa się pod zespół, którego nie jest członkiem.')$$,
  'a profile can be reported');

-- Moderator decisions: proportionate, matching the subject.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000aa3", "role": "authenticated", "aal": "aal2"}';
insert into ids select 'r_event', id from reports where subject_type = 'event';
insert into ids select 'r_venue', id from reports where subject_type = 'venue';
insert into ids select 'r_profile', id from reports where subject_type = 'profile';
select throws_ok($$select moderate_report((select id from ids where name = 'r_event'), 'reset_profile', 'To nie pasuje do zgłoszonej treści.')$$,
  '22023', null, 'the action must fit the subject');
select lives_ok($$select moderate_report((select id from ids where name = 'r_event'), 'remove_event', 'Wydarzenie nie istnieje — potwierdzone z klubem.')$$,
  'a fake event is removed');
select is((select status::text from events where id = (select id from ids where name = 'event')), 'rejected',
  'and leaves the Scene');
select lives_ok($$select moderate_report((select id from ids where name = 'r_venue'), 'clear_venue_details', 'Usunięto link do strony ze spamem i adres.')$$,
  'venue details are cleared');
select is((select coalesce(website, '-') || coalesce(address, '-') from venues where id = (select id from ids where name = 'venue')), '--',
  'address and website are gone, the venue stays');
select lives_ok($$select moderate_report((select id from ids where name = 'r_profile'), 'reset_profile', 'Profil podszywał się pod zespół — nazwa i opis wyczyszczone.')$$,
  'an impersonating profile is reset');

-- The person reads the statement of reasons and appeals; another moderator reverses it.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000aa5", "role": "authenticated"}';
select is((select handle::text from profiles where id = '00000000-0000-0000-0000-000000000aa5'), null, 'the handle is cleared');
select is((select statement from moderation_decisions where subject_type = 'profile'),
  'Profil podszywał się pod zespół — nazwa i opis wyczyszczone.', 'the person sees why');
select lives_ok($$select appeal_moderation_decision((select id from moderation_decisions where subject_type = 'profile'), 'Jestem w tym zespole, mogę to udowodnić.')$$,
  'and appeals');

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000aa4", "role": "authenticated", "aal": "aal2"}';
select decide_appeal((select id from moderation_decisions where subject_type = 'profile'), 'reverse', 'Członkostwo potwierdzone przez artystę.');
select is((select handle::text || '|' || display_name from profiles where id = '00000000-0000-0000-0000-000000000aa5'),
  'falszywy-zespol|Oficjalny Zespół', 'a reversed decision restores the profile');

select * from finish();
rollback;
