-- Catalog: artists, membership, verification requests, labels, genres, releases, tracks, credits,
-- rights declarations. docs/database.md §3.2–3.3, §5; Guidon M2.1.
-- Rule: identity-, membership- and status-changing operations go through functions; clients
-- only edit descriptive columns they are explicitly granted.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.artist_verification as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.artist_status as enum ('active', 'suspended');
create type public.artist_member_role as enum ('owner', 'manager', 'member');
create type public.release_type as enum ('single', 'ep', 'album', 'compilation', 'live');
create type public.release_status as enum (
  'draft', 'processing', 'in_review', 'approved', 'published', 'rejected', 'taken_down'
);
create type public.ai_content as enum ('human', 'ai_assisted', 'ai_generated', 'unknown');
create type public.release_artist_role as enum ('primary', 'featured');
create type public.track_artist_role as enum ('main', 'featured', 'remixer');
create type public.credit_role as enum (
  'producer', 'songwriter', 'composer', 'lyricist', 'performer',
  'mixing_engineer', 'mastering_engineer', 'other'
);

-- ---------------------------------------------------------------------------
-- Artists and membership
-- ---------------------------------------------------------------------------
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique
    constraint artists_slug_format check (slug::text ~ '^[a-z0-9-]{2,60}$')
    constraint artists_slug_not_reserved check (not public.is_reserved_handle(slug::text)),
  name text not null constraint artists_name_length check (char_length(btrim(name)) between 1 and 120),
  bio text constraint artists_bio_length check (char_length(bio) <= 2000),
  formed_year smallint constraint artists_formed_year check (formed_year between 1900 and 2100),
  verification_status public.artist_verification not null default 'unverified',
  verified_at timestamptz,
  status public.artist_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger artists_set_updated_at
  before update on public.artists
  for each row execute function private.set_updated_at();

create table public.artist_members (
  artist_id uuid not null references public.artists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.artist_member_role not null default 'member',
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (artist_id, user_id)
);

create index artist_members_user_idx on public.artist_members (user_id);

/** True when the current user is an accepted member of the artist with one of the roles. */
create function public.is_artist_member(
  artist uuid,
  roles public.artist_member_role[] default array['owner', 'manager', 'member']::public.artist_member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.artist_members m
    where m.artist_id = artist
      and m.user_id = (select auth.uid())
      and m.accepted_at is not null
      and m.role = any (roles)
  );
$$;

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_app_role('moderator') or public.has_app_role('admin');
$$;

-- An artist always keeps at least one accepted owner.
create function private.keep_an_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  artist uuid := coalesce(old.artist_id, new.artist_id);
begin
  if not exists (
    select 1 from public.artist_members m
    where m.artist_id = artist and m.role = 'owner' and m.accepted_at is not null
  ) and exists (select 1 from public.artists a where a.id = artist) then
    raise exception 'an artist must keep at least one owner' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger artist_members_keep_owner
  after update or delete on public.artist_members
  deferrable initially deferred
  for each row execute function private.keep_an_owner();

create table public.artist_verification_requests (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  submitted_by uuid references auth.users (id) on delete set null,
  evidence jsonb not null default '[]'::jsonb
    constraint verification_evidence_array check (jsonb_typeof(evidence) = 'array'),
  note text constraint verification_note_length check (char_length(note) <= 2000),
  status text not null default 'pending'
    constraint verification_status check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create index artist_verification_requests_artist_idx on public.artist_verification_requests (artist_id);

-- ---------------------------------------------------------------------------
-- Labels and genres
-- ---------------------------------------------------------------------------
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique
    constraint labels_slug_format check (slug::text ~ '^[a-z0-9-]{2,60}$'),
  name text not null constraint labels_name_length check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.genres (
  id smallint generated always as identity primary key,
  slug text not null unique constraint genres_slug_format check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_pl text not null,
  name_en text not null,
  parent_id smallint references public.genres (id)
);

insert into public.genres (slug, name_pl, name_en) values
  ('rock', 'Rock', 'Rock'),
  ('alternative', 'Alternatywa', 'Alternative'),
  ('indie', 'Indie', 'Indie'),
  ('punk', 'Punk', 'Punk'),
  ('hardcore', 'Hardcore', 'Hardcore'),
  ('metal', 'Metal', 'Metal'),
  ('post-rock', 'Post-rock', 'Post-rock'),
  ('pop', 'Pop', 'Pop'),
  ('hip-hop', 'Hip-hop', 'Hip-hop'),
  ('electronic', 'Elektronika', 'Electronic'),
  ('techno', 'Techno', 'Techno'),
  ('house', 'House', 'House'),
  ('drum-and-bass', 'Drum and bass', 'Drum and bass'),
  ('ambient', 'Ambient', 'Ambient'),
  ('experimental', 'Eksperymentalna', 'Experimental'),
  ('jazz', 'Jazz', 'Jazz'),
  ('blues', 'Blues', 'Blues'),
  ('soul-funk', 'Soul i funk', 'Soul and funk'),
  ('reggae', 'Reggae', 'Reggae'),
  ('folk', 'Folk', 'Folk'),
  ('singer-songwriter', 'Piosenka autorska', 'Singer-songwriter'),
  ('classical', 'Klasyczna', 'Classical');

-- ---------------------------------------------------------------------------
-- Releases and tracks
-- ---------------------------------------------------------------------------
create table public.releases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete restrict,
  slug extensions.citext not null
    constraint releases_slug_format check (slug::text ~ '^[a-z0-9-]{1,80}$'),
  title text not null constraint releases_title_length check (char_length(btrim(title)) between 1 and 200),
  type public.release_type not null,
  label_id uuid references public.labels (id) on delete set null,
  release_date date,
  publish_at timestamptz,
  status public.release_status not null default 'draft',
  explicit boolean not null default false,
  ai_content public.ai_content not null default 'unknown',
  territories text[] not null default array['WORLD']
    constraint releases_territories check (cardinality(territories) between 1 and 250),
  upc text constraint releases_upc_format check (upc ~ '^[0-9]{12,13}$'),
  p_line text constraint releases_p_line_length check (char_length(p_line) <= 200),
  c_line text constraint releases_c_line_length check (char_length(c_line) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, slug)
);

create index releases_public_idx on public.releases (publish_at) where status = 'published';

create trigger releases_set_updated_at
  before update on public.releases
  for each row execute function private.set_updated_at();

create table public.release_artists (
  release_id uuid not null references public.releases (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete restrict,
  role public.release_artist_role not null default 'featured',
  position smallint not null default 0,
  primary key (release_id, artist_id)
);

create table public.release_genres (
  release_id uuid not null references public.releases (id) on delete cascade,
  genre_id smallint not null references public.genres (id),
  primary key (release_id, genre_id)
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  disc_number smallint not null default 1 constraint tracks_disc check (disc_number between 1 and 20),
  track_number smallint not null constraint tracks_number check (track_number between 1 and 200),
  title text not null constraint tracks_title_length check (char_length(btrim(title)) between 1 and 200),
  isrc text constraint tracks_isrc_format check (isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'),
  duration_ms integer constraint tracks_duration check (duration_ms > 0),
  explicit boolean not null default false,
  ai_content public.ai_content not null default 'unknown',
  soundcheck_start_ms integer constraint tracks_soundcheck_start check (soundcheck_start_ms >= 0),
  soundcheck_duration_ms integer
    constraint tracks_soundcheck_duration check (soundcheck_duration_ms between 5000 and 30000),
  segue_into_next boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracks_position unique (release_id, disc_number, track_number) deferrable initially deferred
);

create index tracks_release_idx on public.tracks (release_id);

create trigger tracks_set_updated_at
  before update on public.tracks
  for each row execute function private.set_updated_at();

create table public.track_artists (
  track_id uuid not null references public.tracks (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete restrict,
  role public.track_artist_role not null default 'featured',
  primary key (track_id, artist_id)
);

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  name text not null constraint credits_name_length check (char_length(btrim(name)) between 1 and 120),
  artist_id uuid references public.artists (id) on delete set null,
  role public.credit_role not null,
  detail text constraint credits_detail_length check (char_length(detail) <= 120),
  created_at timestamptz not null default now()
);

create index credits_track_idx on public.credits (track_id);

-- Immutable evidence: a new declaration supersedes the previous one (latest declared_at wins).
create table public.rights_declarations (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  declared_by uuid not null default auth.uid() references auth.users (id),
  owns_master boolean not null,
  controls_composition boolean not null,
  cmo_memberships text[] not null default '{}'
    constraint rights_cmo_values check (cmo_memberships <@ array['zaiks', 'stoart', 'sawp', 'zpav', 'other_cmo', 'none', 'unknown']),
  samples text not null constraint rights_samples check (samples in ('none', 'cleared')),
  samples_description text constraint rights_samples_description check (char_length(samples_description) <= 2000),
  ai_content public.ai_content not null constraint rights_ai_declared check (ai_content <> 'unknown'),
  territories text[] not null constraint rights_territories check (cardinality(territories) >= 1),
  terms_version text not null,
  declared_at timestamptz not null default now()
);

create index rights_declarations_release_idx on public.rights_declarations (release_id, declared_at desc);

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------
create function public.release_is_public(release uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.releases r
    join public.artists a on a.id = r.artist_id
    where r.id = release and r.status = 'published'
      and r.publish_at is not null and r.publish_at <= now()
      and a.status = 'active'
  );
$$;

create function public.can_view_release(release uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.release_is_public(release)
    or public.is_staff()
    or exists (
      select 1 from public.releases r
      where r.id = release and public.is_artist_member(r.artist_id)
    );
$$;

/** Members may edit a release only while it is a draft or was sent back (rejected). */
create function public.can_edit_release(release uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.releases r
    where r.id = release and r.status in ('draft', 'rejected')
      and public.is_artist_member(r.artist_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Functions for identity/membership changes
-- ---------------------------------------------------------------------------
create function public.create_artist(name text, slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  artist uuid;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  insert into public.artists (slug, name, created_by)
  values (lower(btrim(create_artist.slug)), btrim(create_artist.name), me)
  returning id into artist;
  insert into public.artist_members (artist_id, user_id, role, accepted_at)
  values (artist, me, 'owner', now());
  return artist;
end;
$$;

create function public.invite_artist_member(artist uuid, handle text, role public.artist_member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if not public.is_artist_member(artist, array['owner']::public.artist_member_role[]) then
    raise exception 'only owners can invite members' using errcode = '42501';
  end if;
  select p.id into target from public.profiles p where p.handle = lower(invite_artist_member.handle) and p.deleted_at is null;
  if target is null then
    raise exception 'no profile with this handle' using errcode = 'P0002';
  end if;
  insert into public.artist_members (artist_id, user_id, role, invited_by)
  values (artist, target, invite_artist_member.role, (select auth.uid()))
  on conflict (artist_id, user_id) do nothing;
end;
$$;

create function public.accept_artist_membership(artist uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.artist_members m
  set accepted_at = now()
  where m.artist_id = artist and m.user_id = (select auth.uid()) and m.accepted_at is null;
$$;

/** Owners remove anyone; every member may leave. The last owner cannot leave. */
create function public.remove_artist_member(artist uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if member <> (select auth.uid())
     and not public.is_artist_member(artist, array['owner']::public.artist_member_role[]) then
    raise exception 'only owners can remove other members' using errcode = '42501';
  end if;
  delete from public.artist_members m where m.artist_id = artist and m.user_id = member;
end;
$$;

create function public.request_artist_verification(artist uuid, evidence jsonb, note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request uuid;
begin
  if not public.is_artist_member(artist, array['owner', 'manager']::public.artist_member_role[]) then
    raise exception 'only owners or managers can request verification' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.artist_verification_requests v
    where v.artist_id = artist and v.status = 'pending'
  ) then
    raise exception 'a verification request is already pending' using errcode = '23505';
  end if;
  insert into public.artist_verification_requests (artist_id, submitted_by, evidence, note)
  values (artist, (select auth.uid()), evidence, note)
  returning id into request;
  update public.artists a set verification_status = 'pending'
  where a.id = artist and a.verification_status in ('unverified', 'rejected');
  return request;
end;
$$;

revoke execute on function
  public.create_artist(text, text),
  public.invite_artist_member(uuid, text, public.artist_member_role),
  public.accept_artist_membership(uuid),
  public.remove_artist_member(uuid, uuid),
  public.request_artist_verification(uuid, jsonb, text)
from public, anon;
grant execute on function
  public.create_artist(text, text),
  public.invite_artist_member(uuid, text, public.artist_member_role),
  public.accept_artist_membership(uuid),
  public.remove_artist_member(uuid, uuid),
  public.request_artist_verification(uuid, jsonb, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges (deny by default)
-- ---------------------------------------------------------------------------
revoke all on
  public.artists, public.artist_members, public.artist_verification_requests, public.labels,
  public.genres, public.releases, public.release_artists, public.release_genres, public.tracks,
  public.track_artists, public.credits, public.rights_declarations
from anon, authenticated;

grant select on public.artists, public.labels, public.genres to anon, authenticated;
grant select on public.releases, public.release_artists, public.release_genres, public.tracks,
  public.track_artists, public.credits to anon, authenticated;
grant select on public.artist_members, public.artist_verification_requests,
  public.rights_declarations to authenticated;

-- Descriptive columns only; status/verification change through functions.
grant update (name, bio, formed_year) on public.artists to authenticated;
grant insert (artist_id, slug, title, type, label_id, release_date, explicit, ai_content,
  territories, upc, p_line, c_line) on public.releases to authenticated;
grant update (slug, title, type, label_id, release_date, explicit, ai_content, territories,
  upc, p_line, c_line) on public.releases to authenticated;
grant delete on public.releases to authenticated;
grant insert, update, delete on public.release_artists, public.release_genres, public.tracks,
  public.track_artists, public.credits to authenticated;
grant insert (release_id, owns_master, controls_composition, cmo_memberships, samples,
  samples_description, ai_content, territories, terms_version) on public.rights_declarations
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.artists enable row level security;
alter table public.artist_members enable row level security;
alter table public.artist_verification_requests enable row level security;
alter table public.labels enable row level security;
alter table public.genres enable row level security;
alter table public.releases enable row level security;
alter table public.release_artists enable row level security;
alter table public.release_genres enable row level security;
alter table public.tracks enable row level security;
alter table public.track_artists enable row level security;
alter table public.credits enable row level security;
alter table public.rights_declarations enable row level security;

-- Artists: active artists are public; members and staff also see suspended ones.
create policy "artists readable" on public.artists for select to anon, authenticated
  using (status = 'active' or public.is_artist_member(id) or public.is_staff());
create policy "owners and managers edit artist" on public.artists for update to authenticated
  using (public.is_artist_member(id, array['owner', 'manager']::public.artist_member_role[]))
  with check (public.is_artist_member(id, array['owner', 'manager']::public.artist_member_role[]));

-- Membership: visible to fellow members, to the invited user, and to staff.
create policy "members see membership" on public.artist_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_artist_member(artist_id) or public.is_staff());

create policy "members see verification requests" on public.artist_verification_requests
  for select to authenticated
  using (public.is_artist_member(artist_id) or public.is_staff());

create policy "labels readable" on public.labels for select to anon, authenticated using (true);
create policy "genres readable" on public.genres for select to anon, authenticated using (true);

-- Releases
create policy "releases readable" on public.releases for select to anon, authenticated
  using (public.can_view_release(id));
create policy "members create drafts" on public.releases for insert to authenticated
  with check (status = 'draft' and public.is_artist_member(artist_id));
create policy "members edit drafts" on public.releases for update to authenticated
  using (public.can_edit_release(id))
  with check (public.is_artist_member(artist_id));
create policy "members delete drafts" on public.releases for delete to authenticated
  using (status = 'draft' and public.is_artist_member(artist_id));

-- Release children follow their release.
create policy "release artists readable" on public.release_artists for select to anon, authenticated
  using (public.can_view_release(release_id));
create policy "release artists editable" on public.release_artists for all to authenticated
  using (public.can_edit_release(release_id)) with check (public.can_edit_release(release_id));

create policy "release genres readable" on public.release_genres for select to anon, authenticated
  using (public.can_view_release(release_id));
create policy "release genres editable" on public.release_genres for all to authenticated
  using (public.can_edit_release(release_id)) with check (public.can_edit_release(release_id));

create policy "tracks readable" on public.tracks for select to anon, authenticated
  using (public.can_view_release(release_id));
create policy "tracks editable" on public.tracks for all to authenticated
  using (public.can_edit_release(release_id)) with check (public.can_edit_release(release_id));

create policy "track artists readable" on public.track_artists for select to anon, authenticated
  using (exists (select 1 from public.tracks t where t.id = track_id and public.can_view_release(t.release_id)));
create policy "track artists editable" on public.track_artists for all to authenticated
  using (exists (select 1 from public.tracks t where t.id = track_id and public.can_edit_release(t.release_id)))
  with check (exists (select 1 from public.tracks t where t.id = track_id and public.can_edit_release(t.release_id)));

create policy "credits readable" on public.credits for select to anon, authenticated
  using (exists (select 1 from public.tracks t where t.id = track_id and public.can_view_release(t.release_id)));
create policy "credits editable" on public.credits for all to authenticated
  using (exists (select 1 from public.tracks t where t.id = track_id and public.can_edit_release(t.release_id)))
  with check (exists (select 1 from public.tracks t where t.id = track_id and public.can_edit_release(t.release_id)));

-- Rights declarations: insert-only by members of an editable release; no update/delete grants.
create policy "members and staff read declarations" on public.rights_declarations
  for select to authenticated
  using (public.is_staff() or exists (
    select 1 from public.releases r where r.id = release_id and public.is_artist_member(r.artist_id)));
create policy "members declare rights" on public.rights_declarations for insert to authenticated
  with check (declared_by = (select auth.uid()) and public.can_edit_release(release_id));
