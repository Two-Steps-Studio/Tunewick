-- Global data model (X-DB1, docs/discovery-expansion.md §2): Tunewick is no longer Poland-only.
-- Countries are ISO 3166-1 alpha-2 codes (names come from Intl.DisplayNames in the UI, so every
-- locale works without translating a list); the macro-region feeds regional rankings. The Polish
-- voivodeship stays as Poland's optional region, nothing is removed.

-- ---------------------------------------------------------------------------
-- Countries
-- ---------------------------------------------------------------------------
create table public.countries (
  code text primary key constraint countries_code_format check (code ~ '^[A-Z]{2}$'),
  region text not null
    constraint countries_region check (region in ('africa', 'americas', 'asia', 'europe', 'oceania', 'antarctica'))
);

comment on table public.countries is 'ISO 3166-1 alpha-2 codes (+ XK) with a UN M49 macro-region. Names are rendered by the client.';

insert into public.countries (code, region) values
  ('AD', 'europe'), ('AE', 'asia'), ('AF', 'asia'), ('AG', 'americas'), ('AI', 'americas'), ('AL', 'europe'),
  ('AM', 'asia'), ('AO', 'africa'), ('AQ', 'antarctica'), ('AR', 'americas'), ('AS', 'oceania'), ('AT', 'europe'),
  ('AU', 'oceania'), ('AW', 'americas'), ('AX', 'europe'), ('AZ', 'asia'), ('BA', 'europe'), ('BB', 'americas'),
  ('BD', 'asia'), ('BE', 'europe'), ('BF', 'africa'), ('BG', 'europe'), ('BH', 'asia'), ('BI', 'africa'),
  ('BJ', 'africa'), ('BL', 'americas'), ('BM', 'americas'), ('BN', 'asia'), ('BO', 'americas'), ('BQ', 'americas'),
  ('BR', 'americas'), ('BS', 'americas'), ('BT', 'asia'), ('BV', 'americas'), ('BW', 'africa'), ('BY', 'europe'),
  ('BZ', 'americas'), ('CA', 'americas'), ('CC', 'oceania'), ('CD', 'africa'), ('CF', 'africa'), ('CG', 'africa'),
  ('CH', 'europe'), ('CI', 'africa'), ('CK', 'oceania'), ('CL', 'americas'), ('CM', 'africa'), ('CN', 'asia'),
  ('CO', 'americas'), ('CR', 'americas'), ('CU', 'americas'), ('CV', 'africa'), ('CW', 'americas'), ('CX', 'oceania'),
  ('CY', 'europe'), ('CZ', 'europe'), ('DE', 'europe'), ('DJ', 'africa'), ('DK', 'europe'), ('DM', 'americas'),
  ('DO', 'americas'), ('DZ', 'africa'), ('EC', 'americas'), ('EE', 'europe'), ('EG', 'africa'), ('EH', 'africa'),
  ('ER', 'africa'), ('ES', 'europe'), ('ET', 'africa'), ('FI', 'europe'), ('FJ', 'oceania'), ('FK', 'americas'),
  ('FM', 'oceania'), ('FO', 'europe'), ('FR', 'europe'), ('GA', 'africa'), ('GB', 'europe'), ('GD', 'americas'),
  ('GE', 'asia'), ('GF', 'americas'), ('GG', 'europe'), ('GH', 'africa'), ('GI', 'europe'), ('GL', 'americas'),
  ('GM', 'africa'), ('GN', 'africa'), ('GP', 'americas'), ('GQ', 'africa'), ('GR', 'europe'), ('GS', 'americas'),
  ('GT', 'americas'), ('GU', 'oceania'), ('GW', 'africa'), ('GY', 'americas'), ('HK', 'asia'), ('HM', 'oceania'),
  ('HN', 'americas'), ('HR', 'europe'), ('HT', 'americas'), ('HU', 'europe'), ('ID', 'asia'), ('IE', 'europe'),
  ('IL', 'asia'), ('IM', 'europe'), ('IN', 'asia'), ('IO', 'africa'), ('IQ', 'asia'), ('IR', 'asia'),
  ('IS', 'europe'), ('IT', 'europe'), ('JE', 'europe'), ('JM', 'americas'), ('JO', 'asia'), ('JP', 'asia'),
  ('KE', 'africa'), ('KG', 'asia'), ('KH', 'asia'), ('KI', 'oceania'), ('KM', 'africa'), ('KN', 'americas'),
  ('KP', 'asia'), ('KR', 'asia'), ('KW', 'asia'), ('KY', 'americas'), ('KZ', 'asia'), ('LA', 'asia'),
  ('LB', 'asia'), ('LC', 'americas'), ('LI', 'europe'), ('LK', 'asia'), ('LR', 'africa'), ('LS', 'africa'),
  ('LT', 'europe'), ('LU', 'europe'), ('LV', 'europe'), ('LY', 'africa'), ('MA', 'africa'), ('MC', 'europe'),
  ('MD', 'europe'), ('ME', 'europe'), ('MF', 'americas'), ('MG', 'africa'), ('MH', 'oceania'), ('MK', 'europe'),
  ('ML', 'africa'), ('MM', 'asia'), ('MN', 'asia'), ('MO', 'asia'), ('MP', 'oceania'), ('MQ', 'americas'),
  ('MR', 'africa'), ('MS', 'americas'), ('MT', 'europe'), ('MU', 'africa'), ('MV', 'asia'), ('MW', 'africa'),
  ('MX', 'americas'), ('MY', 'asia'), ('MZ', 'africa'), ('NA', 'africa'), ('NC', 'oceania'), ('NE', 'africa'),
  ('NF', 'oceania'), ('NG', 'africa'), ('NI', 'americas'), ('NL', 'europe'), ('NO', 'europe'), ('NP', 'asia'),
  ('NR', 'oceania'), ('NU', 'oceania'), ('NZ', 'oceania'), ('OM', 'asia'), ('PA', 'americas'), ('PE', 'americas'),
  ('PF', 'oceania'), ('PG', 'oceania'), ('PH', 'asia'), ('PK', 'asia'), ('PL', 'europe'), ('PM', 'americas'),
  ('PN', 'oceania'), ('PR', 'americas'), ('PS', 'asia'), ('PT', 'europe'), ('PW', 'oceania'), ('PY', 'americas'),
  ('QA', 'asia'), ('RE', 'africa'), ('RO', 'europe'), ('RS', 'europe'), ('RU', 'europe'), ('RW', 'africa'),
  ('SA', 'asia'), ('SB', 'oceania'), ('SC', 'africa'), ('SD', 'africa'), ('SE', 'europe'), ('SG', 'asia'),
  ('SH', 'africa'), ('SI', 'europe'), ('SJ', 'europe'), ('SK', 'europe'), ('SL', 'africa'), ('SM', 'europe'),
  ('SN', 'africa'), ('SO', 'africa'), ('SR', 'americas'), ('SS', 'africa'), ('ST', 'africa'), ('SV', 'americas'),
  ('SX', 'americas'), ('SY', 'asia'), ('SZ', 'africa'), ('TC', 'americas'), ('TD', 'africa'), ('TF', 'africa'),
  ('TG', 'africa'), ('TH', 'asia'), ('TJ', 'asia'), ('TK', 'oceania'), ('TL', 'asia'), ('TM', 'asia'),
  ('TN', 'africa'), ('TO', 'oceania'), ('TR', 'asia'), ('TT', 'americas'), ('TV', 'oceania'), ('TW', 'asia'),
  ('TZ', 'africa'), ('UA', 'europe'), ('UG', 'africa'), ('UM', 'americas'), ('US', 'americas'), ('UY', 'americas'),
  ('UZ', 'asia'), ('VA', 'europe'), ('VC', 'americas'), ('VE', 'americas'), ('VG', 'americas'), ('VI', 'americas'),
  ('VN', 'asia'), ('VU', 'oceania'), ('WF', 'oceania'), ('WS', 'oceania'), ('XK', 'europe'), ('YE', 'asia'),
  ('YT', 'africa'), ('ZA', 'africa'), ('ZM', 'africa'), ('ZW', 'africa');
alter table public.countries enable row level security;
create policy countries_readable on public.countries for select to anon, authenticated using (true);
revoke all on public.countries from anon, authenticated;
grant select on public.countries to anon, authenticated;

/** True when every element is a lowercase ISO 639 language code (2–3 letters). */
create function private.is_language_list(codes text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(c ~ '^[a-z]{2,3}$'), true) from unnest(codes) c;
$$;

-- ---------------------------------------------------------------------------
-- Artists: country, free-text region, languages, genres, links
-- ---------------------------------------------------------------------------
alter table public.artists
  add column country_code text references public.countries (code),
  add column region text constraint artists_region_length check (char_length(btrim(region)) between 1 and 80),
  add column languages text[] not null default '{}'
    constraint artists_languages check (cardinality(languages) <= 8 and private.is_language_list(languages));

create index artists_country_idx on public.artists (country_code) where status = 'active';

-- A voivodeship is a Polish region: it implies Poland and cannot sit next to another country.
create function private.artist_country_from_voivodeship()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.voivodeship is not null then
    if new.country_code is null then
      new.country_code := 'PL';
    elsif new.country_code <> 'PL' then
      new.voivodeship := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger artists_country_from_voivodeship
  before insert or update of voivodeship, country_code on public.artists
  for each row execute function private.artist_country_from_voivodeship();

update public.artists set country_code = 'PL' where voivodeship is not null and country_code is null;

grant update (country_code, region, languages) on public.artists to authenticated;

create table public.artist_genres (
  artist_id uuid not null references public.artists (id) on delete cascade,
  genre_id smallint not null references public.genres (id),
  primary key (artist_id, genre_id)
);

create index artist_genres_genre_idx on public.artist_genres (genre_id);

create function private.limit_artist_genres()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.artist_genres g where g.artist_id = new.artist_id) > 5 then
    raise exception 'at most 5 genres per artist' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger artist_genres_limit
  after insert on public.artist_genres
  deferrable initially deferred
  for each row execute function private.limit_artist_genres();

create table public.artist_links (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists (id) on delete cascade,
  kind text not null constraint artist_links_kind check (kind in (
    'website', 'instagram', 'tiktok', 'youtube', 'bandcamp', 'soundcloud', 'spotify', 'x', 'facebook', 'other'
  )),
  url text not null constraint artist_links_url check (url ~ '^https://[^\s]+$' and char_length(url) <= 300),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index artist_links_artist_idx on public.artist_links (artist_id, position);

create function private.limit_artist_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.artist_links l where l.artist_id = new.artist_id) > 10 then
    raise exception 'at most 10 links per artist' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger artist_links_limit
  after insert on public.artist_links
  deferrable initially deferred
  for each row execute function private.limit_artist_links();

alter table public.artist_genres enable row level security;
alter table public.artist_links enable row level security;

create policy artist_genres_readable on public.artist_genres for select to anon, authenticated
  using (exists (select 1 from public.artists a where a.id = artist_id));
create policy artist_genres_editable on public.artist_genres for all to authenticated
  using (public.is_artist_member(artist_id, array['owner', 'manager']::public.artist_member_role[]))
  with check (public.is_artist_member(artist_id, array['owner', 'manager']::public.artist_member_role[]));
create policy artist_links_readable on public.artist_links for select to anon, authenticated
  using (exists (select 1 from public.artists a where a.id = artist_id));
create policy artist_links_editable on public.artist_links for all to authenticated
  using (public.is_artist_member(artist_id, array['owner', 'manager']::public.artist_member_role[]))
  with check (public.is_artist_member(artist_id, array['owner', 'manager']::public.artist_member_role[]));

revoke all on public.artist_genres, public.artist_links from anon, authenticated;
grant select on public.artist_genres, public.artist_links to anon, authenticated;
grant insert, delete on public.artist_genres to authenticated;
grant insert (artist_id, kind, url, position), update (kind, url, position), delete
  on public.artist_links to authenticated;

-- ---------------------------------------------------------------------------
-- Genres heard around the world (names: Polish and English columns; other locales fall back
-- to English until a translation table is needed).
-- ---------------------------------------------------------------------------
insert into public.genres (slug, name_pl, name_en) values
  ('r-and-b', 'R&B', 'R&B'),
  ('trap', 'Trap', 'Trap'),
  ('latin', 'Latin', 'Latin'),
  ('reggaeton', 'Reggaeton', 'Reggaeton'),
  ('afrobeats', 'Afrobeats', 'Afrobeats'),
  ('amapiano', 'Amapiano', 'Amapiano'),
  ('k-pop', 'K-pop', 'K-pop'),
  ('j-pop', 'J-pop', 'J-pop'),
  ('country', 'Country', 'Country'),
  ('world', 'Muzyka świata', 'World'),
  ('lo-fi', 'Lo-fi', 'Lo-fi'),
  ('disco', 'Disco', 'Disco'),
  ('shoegaze', 'Shoegaze', 'Shoegaze'),
  ('dream-pop', 'Dream pop', 'Dream pop');

-- ---------------------------------------------------------------------------
-- Listener preferences (onboarding, feed). Country and city are optional and coarse — never
-- coordinates. Private to the listener.
-- ---------------------------------------------------------------------------
create table public.listener_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  country_code text references public.countries (code),
  city text constraint listener_preferences_city check (char_length(btrim(city)) between 1 and 80),
  content_languages text[] not null default '{}'
    constraint listener_preferences_languages check (cardinality(content_languages) <= 8 and private.is_language_list(content_languages)),
  genre_ids smallint[] not null default '{}'
    constraint listener_preferences_genres check (cardinality(genre_ids) <= 12),
  discovery_mode text not null default 'for_you'
    constraint listener_preferences_mode check (discovery_mode in ('for_you', 'global', 'nearby', 'new', 'rising')),
  exploration_share numeric(3, 2) not null default 0.25
    constraint listener_preferences_exploration check (exploration_share between 0.10 and 0.40),
  hide_explicit boolean not null default false,
  show_in_rankings boolean not null default true,
  time_zone text not null default 'UTC',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger listener_preferences_set_updated_at
  before update on public.listener_preferences
  for each row execute function private.set_updated_at();

create function private.check_listener_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(new.genre_ids) g(id) where not exists (select 1 from public.genres x where x.id = g.id)) then
    raise exception 'unknown genre' using errcode = '23503';
  end if;
  new.genre_ids := array(select distinct g from unnest(new.genre_ids) g order by g);
  return new;
end;
$$;

create trigger listener_preferences_check
  before insert or update on public.listener_preferences
  for each row execute function private.check_listener_preferences();

alter table public.listener_preferences enable row level security;
create policy listener_preferences_own_read on public.listener_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy listener_preferences_own_insert on public.listener_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy listener_preferences_own_update on public.listener_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.listener_preferences from anon, authenticated;
grant select on public.listener_preferences to authenticated;
grant insert (country_code, city, content_languages, genre_ids, discovery_mode, exploration_share,
  hide_explicit, show_in_rankings, time_zone, onboarded_at),
  update (country_code, city, content_languages, genre_ids, discovery_mode, exploration_share,
  hide_explicit, show_in_rankings, time_zone, onboarded_at)
  on public.listener_preferences to authenticated;

-- Interface language: any two-letter code the app supports (the app validates the list), so a
-- new locale needs no migration.
alter table public.profile_settings drop constraint profile_settings_locale;
alter table public.profile_settings add constraint profile_settings_locale check (locale ~ '^[a-z]{2}$');

-- ---------------------------------------------------------------------------
-- Shareable song URLs: /song/{artist}/{title}-{public_code}. Random, not guessable, immutable.
-- ---------------------------------------------------------------------------
create function private.random_code(length integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (get_byte(b, i) % 31) + 1, 1), '')
  from (select extensions.gen_random_bytes(length) as b) r, generate_series(0, length - 1) i;
$$;

alter table public.tracks
  add column public_code text not null default private.random_code(10)
    constraint tracks_public_code_format check (public_code ~ '^[a-z2-9]{10}$');

create unique index tracks_public_code_idx on public.tracks (public_code);

create function private.keep_track_public_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.public_code := old.public_code;
  return new;
end;
$$;

create trigger tracks_keep_public_code
  before update of public_code on public.tracks
  for each row execute function private.keep_track_public_code();
