-- Artist verification review (M10.1, security.md §9): moderators decide pending requests with a
-- statement of reasons. The "verified" badge exists only as this database state.

create function public.review_artist_verification(request uuid, decision text, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending public.artist_verification_requests;
  reason text := nullif(trim(coalesce(note, '')), '');
begin
  perform public.require_staff('moderator');
  if decision not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;
  -- Rejections must say why (statement of reasons, DSA); approvals may add a note.
  if decision = 'reject' and char_length(coalesce(reason, '')) < 10 then
    raise exception 'a rejection needs a reason of at least 10 characters' using errcode = '22023';
  end if;
  if char_length(coalesce(reason, '')) > 2000 then
    raise exception 'the note is too long' using errcode = '22023';
  end if;

  select * into pending from public.artist_verification_requests v where v.id = request for update;
  if pending.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if pending.status <> 'pending' then
    raise exception 'this request was already decided' using errcode = '55000';
  end if;

  update public.artist_verification_requests v
  set status = case decision when 'approve' then 'approved' else 'rejected' end,
      reviewed_by = (select auth.uid()), reviewed_at = now(), decision_note = reason
  where v.id = request;
  update public.artists a
  set verification_status = case decision when 'approve' then 'verified' else 'rejected' end::public.artist_verification
  where a.id = pending.artist_id;

  perform private.write_audit('artist.verification_' || decision, 'artist', pending.artist_id::text,
    jsonb_build_object('request', request), jsonb_build_object('note', reason));
end;
$$;

revoke execute on function public.review_artist_verification(uuid, text, text) from public, anon;
grant execute on function public.review_artist_verification(uuid, text, text) to authenticated;
