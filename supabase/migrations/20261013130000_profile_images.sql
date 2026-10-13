-- Profile pictures for every account (shown in the top bar and on the public profile). Same path
-- as covers and artist photos: presigned upload to the ingest bucket, the worker re-encodes it to
-- small WebP sizes, the result is attached to the profile. Comparisons use kind::text so the new
-- enum value is never cast while this migration's transaction is still open.

alter type public.image_kind add value if not exists 'profile_image';

alter table public.images
  add column profile_id uuid references public.profiles (id) on delete cascade;
alter table public.images drop constraint images_owner;
alter table public.images add constraint images_owner check (
  (kind::text = 'release_artwork' and release_id is not null and artist_id is null and profile_id is null)
  or (kind::text = 'artist_image' and artist_id is not null and release_id is null and profile_id is null)
  or (kind::text = 'profile_image' and profile_id is not null and release_id is null and artist_id is null)
);
create index images_profile_idx on public.images (profile_id, created_at desc) where profile_id is not null;

alter table public.profiles
  add column image_id uuid references public.images (id) on delete set null;

/** As before, plus: your own profile pictures, and the one attached to a visible profile. */
create or replace function public.can_view_image(image uuid)
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
    left join public.profiles p on p.id = i.profile_id
    where i.id = image
      and (
        (i.profile_id is not null and i.profile_id = (select auth.uid()))
        or public.is_staff()
        or (a.id is not null and public.is_artist_member(a.id))
        or (i.status = 'accepted' and (
          (i.kind::text = 'release_artwork' and r.artwork_image_id = i.id and public.release_is_public(r.id))
          or (i.kind::text = 'artist_image' and a.image_id = i.id and a.status = 'active')
          or (i.kind::text = 'profile_image' and p.image_id = i.id and p.deleted_at is null)
        ))
      )
  );
$$;

create or replace function public.begin_image_upload(
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
  if begin_image_upload.kind::text = 'release_artwork' then
    if not public.can_edit_release(begin_image_upload.owner) then
      raise exception 'not allowed to change this release' using errcode = '42501';
    end if;
  elsif begin_image_upload.kind::text = 'profile_image' then
    if begin_image_upload.owner is distinct from (select auth.uid()) then
      raise exception 'only your own profile picture' using errcode = '42501';
    end if;
  elsif not public.is_artist_member(begin_image_upload.owner, array['owner', 'manager']::public.artist_member_role[]) then
    raise exception 'not allowed to change this artist' using errcode = '42501';
  end if;

  if ext not in ('jpg', 'jpeg', 'png', 'webp') then
    raise exception 'only JPEG, PNG and WebP images are accepted' using errcode = '22023';
  end if;

  if (
    select count(*) from public.images i
    where coalesce(i.release_id, i.artist_id, i.profile_id) = begin_image_upload.owner
      and i.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'too many uploads, try again later' using errcode = '54000';
  end if;

  insert into public.images (id, kind, release_id, artist_id, profile_id, uploaded_by, object_key, size_bytes)
  values (
    new_id,
    begin_image_upload.kind,
    case when begin_image_upload.kind::text = 'release_artwork' then begin_image_upload.owner end,
    case when begin_image_upload.kind::text = 'artist_image' then begin_image_upload.owner end,
    case when begin_image_upload.kind::text = 'profile_image' then begin_image_upload.owner end,
    (select auth.uid()),
    format('images/%s/%s.%s', begin_image_upload.kind, new_id, ext),
    begin_image_upload.size_bytes
  )
  returning * into result;
  return result;
end;
$$;

create or replace function public.finish_image_upload(image uuid, result jsonb)
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

    if current.kind::text = 'release_artwork' then
      update public.releases r set artwork_image_id = current.id
      where r.id = current.release_id and r.status in ('draft', 'rejected');
    elsif current.kind::text = 'profile_image' then
      update public.profiles p set image_id = current.id where p.id = current.profile_id;
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

/** Removes your profile picture (the file goes to the storage sweep with the row). */
create function public.remove_profile_image()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  delete from public.images i where i.profile_id = (select auth.uid());
end;
$$;

revoke execute on function public.remove_profile_image() from public, anon;
grant execute on function public.remove_profile_image() to authenticated;

-- Any image row that goes away (account deletion, a removed picture, a deleted release) takes its
-- files with it: the original in the ingest bucket and every processed size in the media bucket.
create function private.image_objects_forgotten()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  variant jsonb;
begin
  insert into private.storage_deletions (bucket, object_key) values ('ingest', old.object_key);
  for variant in select * from jsonb_array_elements(coalesce(old.variants, '[]'::jsonb)) loop
    if variant ->> 'key' is not null then
      insert into private.storage_deletions (bucket, object_key) values ('media', variant ->> 'key');
    end if;
  end loop;
  return null;
end;
$$;

create trigger images_objects_forgotten
  after delete on public.images
  for each row execute function private.image_objects_forgotten();
