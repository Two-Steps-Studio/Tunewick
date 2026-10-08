-- Reports about gigs, venues and people (M8.3): the DSA notice-and-action flow of M10.2 now covers
-- events, venues and user profiles. Proportionate, reversible actions only:
--   event   → remove_event: the event is rejected (off the Scene), reversible on appeal;
--   venue   → clear_venue_details: address and website removed (spam links, wrong data); the
--             venue itself stays, because its gigs belong to artists;
--   profile → reset_profile: handle, display name and bio cleared (impersonation, abuse).
-- New enum values are compared as text in this migration: they cannot be used as enum literals in
-- the transaction that adds them.

alter type public.report_subject add value if not exists 'event';
alter type public.report_subject add value if not exists 'venue';
alter type public.report_subject add value if not exists 'profile';

alter table public.moderation_decisions drop constraint moderation_decisions_action;
alter table public.moderation_decisions add constraint moderation_decisions_action check (action in (
  'dismiss', 'takedown_release', 'suspend_artist', 'hide_playlist', 'remove_event', 'clear_venue_details', 'reset_profile'));

/** Who owns the subject, and whether it is public right now (only public content is reported). */
create or replace function private.report_subject_owner(subject_type public.report_subject, subject_id uuid)
returns table (artist_id uuid, owner_id uuid, is_public boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, null::uuid, a.status = 'active'
  from public.artists a where subject_type::text = 'artist' and a.id = subject_id
  union all
  select r.artist_id, null::uuid, public.release_is_public(r.id)
  from public.releases r where subject_type::text = 'release' and r.id = subject_id
  union all
  select null::uuid, p.owner_id, p.visibility in ('public', 'unlisted')
  from public.playlists p where subject_type::text = 'playlist' and p.id = subject_id
  union all
  select e.artist_id, null::uuid, e.status in ('published', 'cancelled')
  from public.events e where subject_type::text = 'event' and e.id = subject_id
  union all
  select null::uuid, v.created_by, true
  from public.venues v where subject_type::text = 'venue' and v.id = subject_id
  union all
  select null::uuid, p.id, p.deleted_at is null and p.handle is not null
  from public.profiles p where subject_type::text = 'profile' and p.id = subject_id;
$$;

create or replace function public.moderate_report(report uuid, action text, statement text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_report public.reports;
  owner record;
  previous jsonb := '{}'::jsonb;
  decision uuid;
begin
  perform public.require_staff('moderator');
  select * into open_report from public.reports r where r.id = report for update;
  if open_report.id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if open_report.status <> 'open' then
    raise exception 'this report was already decided' using errcode = '55000';
  end if;
  if char_length(coalesce(trim(statement), '')) < 20 then
    raise exception 'a statement of reasons needs at least 20 characters' using errcode = '22023';
  end if;
  if action not in ('dismiss', 'takedown_release', 'suspend_artist', 'hide_playlist', 'remove_event',
       'clear_venue_details', 'reset_profile')
     or (action = 'takedown_release' and open_report.subject_type::text <> 'release')
     or (action = 'suspend_artist' and open_report.subject_type::text <> 'artist')
     or (action = 'hide_playlist' and open_report.subject_type::text <> 'playlist')
     or (action = 'remove_event' and open_report.subject_type::text <> 'event')
     or (action = 'clear_venue_details' and open_report.subject_type::text <> 'venue')
     or (action = 'reset_profile' and open_report.subject_type::text <> 'profile') then
    raise exception 'this action does not fit the reported content' using errcode = '22023';
  end if;

  select * into owner from private.report_subject_owner(open_report.subject_type, open_report.subject_id);

  if action = 'takedown_release' then
    select jsonb_build_object('status', r.status) into previous from public.releases r where r.id = open_report.subject_id;
    update public.releases r set status = 'taken_down' where r.id = open_report.subject_id;
  elsif action = 'suspend_artist' then
    select jsonb_build_object('status', a.status) into previous from public.artists a where a.id = open_report.subject_id;
    update public.artists a set status = 'suspended' where a.id = open_report.subject_id;
  elsif action = 'hide_playlist' then
    select jsonb_build_object('visibility', p.visibility) into previous from public.playlists p where p.id = open_report.subject_id;
    update public.playlists p set visibility = 'private' where p.id = open_report.subject_id;
  elsif action = 'remove_event' then
    select jsonb_build_object('status', e.status) into previous from public.events e where e.id = open_report.subject_id;
    update public.events e set status = 'rejected' where e.id = open_report.subject_id;
  elsif action = 'clear_venue_details' then
    select jsonb_build_object('address', v.address, 'website', v.website) into previous
    from public.venues v where v.id = open_report.subject_id;
    update public.venues v set address = null, website = null where v.id = open_report.subject_id;
  elsif action = 'reset_profile' then
    select jsonb_build_object('handle', p.handle, 'display_name', p.display_name, 'bio', p.bio) into previous
    from public.profiles p where p.id = open_report.subject_id;
    update public.profiles p set handle = null, display_name = null, bio = null where p.id = open_report.subject_id;
  end if;

  insert into public.moderation_decisions (subject_type, subject_id, artist_id, owner_id, action, reason, statement,
    previous_state, decided_by)
  values (open_report.subject_type, open_report.subject_id, owner.artist_id, owner.owner_id, action, open_report.reason,
    trim(statement), previous, (select auth.uid()))
  returning id into decision;

  update public.reports r
  set status = case when action = 'dismiss' then 'dismissed' else 'actioned' end, decision_id = decision
  where r.subject_type = open_report.subject_type and r.subject_id = open_report.subject_id and r.status = 'open';

  perform private.write_audit('moderation.' || action, open_report.subject_type::text, open_report.subject_id::text,
    previous, jsonb_build_object('decision', decision, 'report', report, 'reason', open_report.reason));
  return decision;
end;
$$;

create or replace function public.decide_appeal(decision uuid, outcome text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.moderation_decisions;
begin
  perform public.require_staff('moderator');
  select * into d from public.moderation_decisions m where m.id = decision for update;
  if d.id is null then
    raise exception 'decision not found' using errcode = 'P0002';
  end if;
  if d.appeal_status <> 'pending' then
    raise exception 'there is no pending appeal' using errcode = '55000';
  end if;
  if d.decided_by = (select auth.uid()) then
    raise exception 'a different moderator must decide the appeal' using errcode = '42501';
  end if;
  if outcome not in ('uphold', 'reverse') then
    raise exception 'outcome must be uphold or reverse' using errcode = '22023';
  end if;
  if char_length(coalesce(trim(note), '')) < 20 then
    raise exception 'the appeal decision needs reasons of at least 20 characters' using errcode = '22023';
  end if;

  if outcome = 'reverse' then
    if d.action = 'takedown_release' then
      update public.releases r set status = (d.previous_state ->> 'status')::public.release_status
      where r.id = d.subject_id and r.status = 'taken_down';
    elsif d.action = 'suspend_artist' then
      update public.artists a set status = (d.previous_state ->> 'status')::public.artist_status
      where a.id = d.subject_id and a.status = 'suspended';
    elsif d.action = 'hide_playlist' then
      update public.playlists p set visibility = (d.previous_state ->> 'visibility')::public.playlist_visibility
      where p.id = d.subject_id;
    elsif d.action = 'remove_event' then
      update public.events e set status = (d.previous_state ->> 'status')::public.event_status
      where e.id = d.subject_id and e.status = 'rejected';
    elsif d.action = 'clear_venue_details' then
      update public.venues v
      set address = coalesce(v.address, d.previous_state ->> 'address'),
          website = coalesce(v.website, d.previous_state ->> 'website')
      where v.id = d.subject_id;
    elsif d.action = 'reset_profile' then
      -- The handle comes back only if nobody took it in the meantime.
      update public.profiles p
      set handle = case when exists (select 1 from public.profiles o
                                      where o.handle = (d.previous_state ->> 'handle') and o.id <> p.id)
                        then p.handle else coalesce(p.handle, d.previous_state ->> 'handle') end,
          display_name = coalesce(p.display_name, d.previous_state ->> 'display_name'),
          bio = coalesce(p.bio, d.previous_state ->> 'bio')
      where p.id = d.subject_id;
    end if;
  end if;

  update public.moderation_decisions m
  set appeal_status = case outcome when 'uphold' then 'upheld' else 'reversed' end,
      appeal_note = trim(note), appeal_decided_by = (select auth.uid()), appeal_decided_at = now()
  where m.id = decision;
  perform private.write_audit('moderation.appeal_' || outcome, d.subject_type::text, d.subject_id::text, null,
    jsonb_build_object('decision', decision));
end;
$$;
