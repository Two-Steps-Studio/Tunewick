-- Identity foundation: extensions, private schema, profiles, profile settings, platform roles.
-- See docs/database.md §1, §3.1 and docs/security.md §3.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Private schema: never exposed through the Data API.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('moderator', 'admin');
create type public.visibility_level as enum ('public', 'followers', 'private');

-- ---------------------------------------------------------------------------
-- profiles: public-facing identity. Readable by everyone while not deleted.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle extensions.citext unique
    constraint profiles_handle_format check (handle::text ~ '^[a-z0-9-]{2,40}$'),
  display_name text
    constraint profiles_display_name_length check (char_length(display_name) between 1 and 80),
  bio text
    constraint profiles_bio_length check (char_length(bio) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.profiles is 'Public profile fields only. Private settings live in profile_settings.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- profile_settings: private per-user settings. Readable/writable by the owner only.
-- ---------------------------------------------------------------------------
create table public.profile_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  locale text not null default 'pl'
    constraint profile_settings_locale check (locale in ('pl', 'en')),
  activity_visibility public.visibility_level not null default 'followers',
  age_confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger profile_settings_set_updated_at
  before update on public.profile_settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_roles: platform roles. No writes through the Data API.
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.has_role(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = required
  );
$$;

revoke execute on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated;

-- Create profile + settings when an auth user is created.
-- Only whitelisted, validated metadata is used.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested_locale text := meta ->> 'locale';
  requested_name text := nullif(btrim(meta ->> 'display_name'), '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(requested_name, 80));

  insert into public.profile_settings (user_id, locale, age_confirmed_at)
  values (
    new.id,
    case when requested_locale in ('pl', 'en') then requested_locale else 'pl' end,
    case when (meta ->> 'age_confirmed') = 'true' then now() else null end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privileges: deny by default, grant explicitly.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.profile_settings, public.user_roles from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (handle, display_name, bio) on public.profiles to authenticated;

grant select on public.profile_settings to authenticated;
grant update (locale, activity_visibility) on public.profile_settings to authenticated;

grant select on public.user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profile_settings enable row level security;
alter table public.user_roles enable row level security;

create policy "profiles are publicly readable while active"
  on public.profiles for select
  to anon, authenticated
  using (deleted_at is null);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));

create policy "users read their own settings"
  on public.profile_settings for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users update their own settings"
  on public.profile_settings for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users read their own roles"
  on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()));
