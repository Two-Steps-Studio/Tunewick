-- Artwork and artist images (M2.5, docs/security.md §5.5).
--
-- Same path as masters: the browser uploads the original to the ingest bucket (presigned PUT),
-- the worker decodes and re-encodes it to WebP sizes in the media bucket, and the result is
-- attached to the release (cover) or artist (photo). No original is ever served. File names are
-- not stored (they can contain personal data); public readers see only processed, attached images.

create type public.image_kind as enum ('release_artwork', 'artist_image');

create table public.images (
  id uuid primary key default gen_random_uuid(),
  kind public.image_kind not null,
  release_id uuid references public.releases (id) on delete cascade,
  artist_id uuid references public.artists (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  object_key text not null unique,
  size_bytes bigint not null constraint images_size check (size_bytes between 1024 and 26214400),
  status public.audio_upload_status not null default 'pending',
  rejection_code text,
  attempts integer not null default 0,
  claimed_at timestamptz,
  uploaded_at timestamptz,
  processed_at timestamptz,
  width integer,
  height integer,
  dominant_color text constraint images_color check (dominant_color ~ '^#[0-9a-f]{6}$'),
  -- [{ "width": 640, "key": "images/<id>/640.webp", "bytes": 51234 }, …] smallest first
  variants jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint images_owner check (
    (kind = 'release_artwork' and release_id is not null and artist_id is null)
    or (kind = 'artist_image' and artist_id is not null and release_id is null)
  )
);

create index images_release_idx on public.images (release_id, created_at desc);
create index images_artist_idx on public.images (artist_id, created_at desc);
create index images_queue_idx on public.images (uploaded_at) where status = 'uploaded';

create trigger images_set_updated_at
  before update on public.images
  for each row execute function private.set_updated_at();

alter table public.releases
  add column artwork_image_id uuid references public.images (id) on delete set null;
alter table public.artists
  add column image_id uuid references public.images (id) on delete set null;

/** Members and staff see every image of their release/artist; others only the attached one. */
create function public.can_view_image(image uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.images i
    left join public.releases r on r.id = i.release_id
    left join public.artists a on a.id = coalesce(i.artist_id, r.artist_id)
    where i.id = image
      and (
        public.is_artist_member(a.id)
        or public.is_staff()
        or (i.status = 'accepted' and (
          (i.kind = 'release_artwork' and r.artwork_image_id = i.id and public.release_is_public(r.id))
          or (i.kind = 'artist_image' and a.image_id = i.id and a.status = 'active')
        ))
      )
  );
$$;

alter table public.images enable row level security;

create policy "images: members, staff, or attached and public"
  on public.images for select to anon, authenticated
  using (public.can_view_image(id));

revoke all on public.images from anon, authenticated;
grant select on public.images to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Member functions
-- ---------------------------------------------------------------------------
create function public.begin_image_upload(
  kind public.image_kind, owner uuid, extension text, size_bytes bigint
)
returns public.images
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ext text := lower(btrim(begin_image_upload.extension, '. '));
  new_id uuid := gen_random_uuid();
  result public.images;
begin
  if begin_image_upload.kind = 'release_artwork' then
    if not public.can_edit_release(begin_image_upload.owner) then
      raise exception 'not allowed to change this release' using errcode = '42501';
    end if;
  elsif not public.is_artist_member(begin_image_upload.owner, array['owner', 'manager']::public.artist_member_role[]) then
    raise exception 'not allowed to change this artist' using errcode = '42501';
  end if;

  if ext not in ('jpg', 'jpeg', 'png', 'webp') then
    raise exception 'only JPEG, PNG and WebP images are accepted' using errcode = '22023';
  end if;

  if (
    select count(*) from public.images i
    where coalesce(i.release_id, i.artist_id) = begin_image_upload.owner
      and i.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'too many uploads, try again later' using errcode = '54000';
  end if;

  insert into public.images (id, kind, release_id, artist_id, uploaded_by, object_key, size_bytes)
  values (
    new_id,
    begin_image_upload.kind,
    case when begin_image_upload.kind = 'release_artwork' then begin_image_upload.owner end,
    case when begin_image_upload.kind = 'artist_image' then begin_image_upload.owner end,
    (select auth.uid()),
    format('images/%s/%s.%s', begin_image_upload.kind, new_id, ext),
    begin_image_upload.size_bytes
  )
  returning * into result;
  return result;
end;
$$;

create function public.complete_image_upload(image uuid)
returns public.images
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result public.images;
begin
  update public.images i
  set status = 'uploaded', uploaded_at = now()
  where i.id = complete_image_upload.image
    and i.status = 'pending'
    and i.uploaded_by = (select auth.uid())
  returning * into result;
  if result.id is null then
    raise exception 'image not found or not pending' using errcode = '42501';
  end if;
  return result;
end;
$$;

create function public.abandon_image_upload(image uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.images i
  set status = 'failed', rejection_code = 'upload_incomplete'
  where i.id = abandon_image_upload.image
    and i.status = 'pending'
    and i.uploaded_by = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Worker functions (service role only)
-- ---------------------------------------------------------------------------
create function public.claim_image_upload()
returns table (id uuid, kind public.image_kind, object_key text, attempts integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  update public.images i
  set status = 'failed', rejection_code = 'processing_failed'
  where i.status = 'processing' and i.claimed_at < now() - interval '15 minutes' and i.attempts >= 3;

  return query
  update public.images i
  set status = 'processing', claimed_at = now(), attempts = i.attempts + 1
  where i.id = (
    select c.id from public.images c
    where c.status = 'uploaded'
       or (c.status = 'processing' and c.claimed_at < now() - interval '15 minutes')
    order by c.uploaded_at
    for update skip locked
    limit 1
  )
  returning i.id, i.kind, i.object_key, i.attempts;
end;
$$;

/**
 * Records the worker result. An accepted cover replaces the release's current one only while the
 * release can still be edited — a cover finishing during review must not change what moderators
 * are looking at.
 */
create function public.finish_image_upload(image uuid, result jsonb)
returns public.audio_upload_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current public.images;
begin
  select * into current from public.images i
  where i.id = finish_image_upload.image and i.status = 'processing'
  for update;
  if current.id is null then
    raise exception 'image is not being processed' using errcode = '55000';
  end if;

  if finish_image_upload.result ->> 'status' = 'accepted' then
    update public.images i
    set status = 'accepted',
        processed_at = now(),
        rejection_code = null,
        width = (finish_image_upload.result ->> 'width')::integer,
        height = (finish_image_upload.result ->> 'height')::integer,
        dominant_color = finish_image_upload.result ->> 'dominant_color',
        variants = finish_image_upload.result -> 'variants'
    where i.id = current.id;

    if current.kind = 'release_artwork' then
      update public.releases r set artwork_image_id = current.id
      where r.id = current.release_id and r.status in ('draft', 'rejected');
    else
      update public.artists a set image_id = current.id where a.id = current.artist_id;
    end if;
    return 'accepted'::public.audio_upload_status;
  end if;

  update public.images i
  set status = 'rejected',
      processed_at = now(),
      rejection_code = left(finish_image_upload.result -> 'rejection' ->> 'code', 64)
  where i.id = current.id;
  return 'rejected'::public.audio_upload_status;
end;
$$;

create function public.fail_image_upload(image uuid)
returns public.audio_upload_status
language sql
volatile
security definer
set search_path = ''
as $$
  update public.images i
  set status = case when i.attempts >= 3 then 'failed' else 'uploaded' end::public.audio_upload_status,
      rejection_code = case when i.attempts >= 3 then 'processing_failed' end,
      claimed_at = null
  where i.id = fail_image_upload.image and i.status = 'processing'
  returning i.status;
$$;

-- ---------------------------------------------------------------------------
-- Readiness now also requires a processed cover (audio.md §2.1).
-- ---------------------------------------------------------------------------
create or replace function public.release_readiness(release uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.can_view_release(release) then null else jsonb_build_object(
    'tracks', exists (select 1 from public.tracks t where t.release_id = release),
    'ai', coalesce((select r.ai_content <> 'unknown' from public.releases r where r.id = release), false),
    'rights', exists (select 1 from public.rights_declarations d where d.release_id = release),
    'artwork', exists (
      select 1 from public.releases r join public.images i on i.id = r.artwork_image_id
      where r.id = release and i.status = 'accepted'
    ),
    'audio', exists (select 1 from public.tracks t where t.release_id = release)
      and not exists (
        select 1 from public.tracks t
        where t.release_id = release
          and coalesce(
            (select u.status from public.track_audio_uploads u
             where u.track_id = t.id order by u.created_at desc limit 1),
            'pending'
          ) <> 'accepted'
      )
  ) end;
$$;

create or replace function public.submit_release(release uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current public.releases;
  ready jsonb;
begin
  select * into current from public.releases r where r.id = submit_release.release for update;
  if current.id is null or not public.is_artist_member(current.artist_id) then
    raise exception 'not allowed to submit this release' using errcode = '42501';
  end if;
  if current.status not in ('draft', 'rejected') then
    raise exception 'only drafts and returned releases can be submitted' using errcode = '55000';
  end if;

  ready := public.release_readiness(current.id);
  if exists (select 1 from jsonb_each_text(ready) e where e.value <> 'true') then
    raise exception 'release is not ready for review' using errcode = '55000', detail = ready::text;
  end if;

  update public.releases r
  set status = 'in_review', submitted_at = now(), review_note = null
  where r.id = current.id;
  insert into public.release_review_events (release_id, kind) values (current.id, 'submitted');
end;
$$;

revoke execute on function
  public.can_view_image(uuid),
  public.begin_image_upload(public.image_kind, uuid, text, bigint),
  public.complete_image_upload(uuid),
  public.abandon_image_upload(uuid),
  public.claim_image_upload(),
  public.finish_image_upload(uuid, jsonb),
  public.fail_image_upload(uuid)
from public, anon, authenticated;

grant execute on function public.can_view_image(uuid) to anon, authenticated;
grant execute on function
  public.begin_image_upload(public.image_kind, uuid, text, bigint),
  public.complete_image_upload(uuid),
  public.abandon_image_upload(uuid)
to authenticated;
grant execute on function
  public.claim_image_upload(),
  public.finish_image_upload(uuid, jsonb),
  public.fail_image_upload(uuid)
to service_role;
