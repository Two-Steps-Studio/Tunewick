-- Discovery ledger (X-DB2, docs/discovery-expansion.md §5). Every point a listener earns is a row
-- in discovery_points with an idempotency key, written only by the database after its own checks.
-- Score, streaks, goals, records and rankings are all derived from it — never from listening time
-- alone. Previews from the Discover feed are listens too (context 'preview'); they never count
-- towards payouts (a payout play is a 'player' listen of ≥ 30 s, D2).

-- ---------------------------------------------------------------------------
-- Listening context
-- ---------------------------------------------------------------------------
alter table public.listening_events
  add column context text not null default 'player'
    constraint listening_events_context check (context in ('player', 'preview'));

-- ---------------------------------------------------------------------------
-- Saves: the listener's "saved from Discover" crate (Like stays the existing track_likes).
-- ---------------------------------------------------------------------------
create table public.track_saves (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create index track_saves_recent_idx on public.track_saves (user_id, created_at desc);
create index track_saves_track_idx on public.track_saves (track_id);

alter table public.track_saves enable row level security;
create policy track_saves_own_read on public.track_saves for select to authenticated
  using (user_id = (select auth.uid()));
create policy track_saves_own_insert on public.track_saves for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.release_is_public((select t.release_id from public.tracks t where t.id = track_id))
  );
create policy track_saves_own_delete on public.track_saves for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.track_saves from anon, authenticated;
grant select, delete on public.track_saves to authenticated;
grant insert (track_id) on public.track_saves to authenticated;

-- ---------------------------------------------------------------------------
-- Point rules: values and rolling-24 h caps are data, editable by staff without a deploy.
-- ---------------------------------------------------------------------------
create table public.discovery_point_rules (
  kind text primary key
    constraint discovery_point_rules_kind check (kind in (
      'new_song', 'new_artist', 'new_genre', 'new_country', 'save', 'full_listen', 'share'
    )),
  points smallint not null constraint discovery_point_rules_points check (points between 0 and 100),
  daily_cap smallint not null constraint discovery_point_rules_cap check (daily_cap >= 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger discovery_point_rules_set_updated_at
  before update on public.discovery_point_rules
  for each row execute function private.set_updated_at();

insert into public.discovery_point_rules (kind, points, daily_cap) values
  ('new_song', 1, 150),
  ('new_artist', 3, 90),
  ('new_genre', 5, 25),
  ('new_country', 5, 25),
  ('save', 2, 40),
  ('full_listen', 1, 30),
  ('share', 3, 15);

alter table public.discovery_point_rules enable row level security;
create policy discovery_point_rules_readable on public.discovery_point_rules for select to anon, authenticated
  using (true);
create policy discovery_point_rules_staff_update on public.discovery_point_rules for update to authenticated
  using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
revoke all on public.discovery_point_rules from anon, authenticated;
grant select on public.discovery_point_rules to anon, authenticated;
grant update (points, daily_cap, enabled) on public.discovery_point_rules to authenticated;

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create table public.discovery_points (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null references public.discovery_point_rules (kind),
  -- Once per key: the track for new_song/save, the artist for new_artist, track:day for full
  -- listens and shares. A second award with the same key is silently ignored.
  award_key text not null constraint discovery_points_key_length check (char_length(award_key) <= 80),
  points smallint not null constraint discovery_points_points check (points >= 0),
  track_id uuid references public.tracks (id) on delete set null,
  artist_id uuid references public.artists (id) on delete set null,
  genre_id smallint references public.genres (id),
  country_code text references public.countries (code),
  -- new_artist only: followers when discovered (Early Supporter).
  artist_followers_at integer,
  created_at timestamptz not null default now(),
  unique (user_id, kind, award_key)
);

create index discovery_points_user_idx on public.discovery_points (user_id, created_at desc);
create index discovery_points_period_idx on public.discovery_points (created_at, user_id);
create index discovery_points_artist_idx on public.discovery_points (artist_id) where kind = 'new_artist';
create index discovery_points_track_idx on public.discovery_points (track_id);

alter table public.discovery_points enable row level security;
create policy discovery_points_own_read on public.discovery_points for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.discovery_points from anon, authenticated;
grant select on public.discovery_points to authenticated;

/**
 * Awards one rule to a listener, at most once per key. Points are reduced to what is left under
 * the rule's rolling 24 h cap (the row is still written with 0 points, so the discovery counts
 * and cannot be earned again later). Returns the points granted, or null when the key was
 * already awarded or the rule is disabled.
 */
create function private.award(
  listener uuid,
  award_kind text,
  key text,
  track uuid default null,
  artist uuid default null,
  genre smallint default null,
  country text default null,
  followers integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.discovery_point_rules%rowtype;
  earned integer;
  granted integer;
begin
  select * into rule from public.discovery_point_rules r where r.kind = award_kind;
  if not found or not rule.enabled then
    return null;
  end if;
  select coalesce(sum(p.points), 0) into earned
  from public.discovery_points p
  where p.user_id = listener and p.kind = award_kind and p.created_at > now() - interval '24 hours';
  granted := greatest(0, least(rule.points, rule.daily_cap - earned));
  insert into public.discovery_points (user_id, kind, award_key, points, track_id, artist_id, genre_id, country_code, artist_followers_at)
  values (listener, award_kind, key, granted, track, artist, genre, country, followers)
  on conflict (user_id, kind, award_key) do nothing
  returning points into granted;
  return granted;
end;
$$;

revoke execute on function private.award(uuid, text, text, uuid, uuid, smallint, text, integer) from public, anon, authenticated;

/** The listener's time zone for day boundaries (UTC until they set one). */
create function private.listener_tz(listener uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.time_zone from public.listener_preferences p where p.user_id = listener), 'UTC');
$$;

revoke execute on function private.listener_tz(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Achievements: definitions are rows (metric + threshold), so adding one is an insert.
-- ---------------------------------------------------------------------------
create table public.achievements (
  code text primary key constraint achievements_code_format check (code ~ '^[a-z_]{2,40}$'),
  metric text not null constraint achievements_metric check (metric in (
    'songs', 'artists', 'genres', 'countries', 'longest_streak', 'deep_genre', 'early_supporter', 'saves'
  )),
  threshold integer not null constraint achievements_threshold check (threshold > 0),
  position smallint not null default 0
);

insert into public.achievements (code, metric, threshold, position) values
  ('first_discovery', 'songs', 1, 10),
  ('curious_ears', 'songs', 100, 20),
  ('crate_digger', 'songs', 1000, 30),
  ('explorer', 'artists', 100, 40),
  ('genre_hunter', 'genres', 20, 50),
  ('deep_diver', 'deep_genre', 10, 60),
  ('world_traveler', 'countries', 25, 70),
  ('global_explorer', 'countries', 50, 80),
  ('on_a_roll', 'longest_streak', 7, 90),
  ('unstoppable', 'longest_streak', 30, 100),
  ('collector', 'saves', 50, 110),
  ('early_supporter', 'early_supporter', 1, 120);

create table public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null references public.achievements (code) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
create policy achievements_readable on public.achievements for select to anon, authenticated using (true);
create policy user_achievements_own_read on public.user_achievements for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.achievements, public.user_achievements from anon, authenticated;
grant select on public.achievements to anon, authenticated;
grant select on public.user_achievements to authenticated;

/** Local days (listener's time zone) with at least one new-song discovery. */
create function private.discovery_days(listener uuid)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select distinct (p.created_at at time zone private.listener_tz(listener))::date
  from public.discovery_points p
  where p.user_id = listener and p.kind = 'new_song';
$$;

revoke execute on function private.discovery_days(uuid) from public, anon, authenticated;

/** Current and longest streak of consecutive discovery days. A streak survives until today ends. */
create function private.streaks(listener uuid, out current_streak integer, out longest_streak integer)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d, d - (row_number() over (order by d))::integer as island
    from private.discovery_days(listener) d
  ), runs as (
    select min(d) as first_day, max(d) as last_day, count(*)::integer as length from days group by island
  ), today as (
    select (now() at time zone private.listener_tz(listener))::date as d
  )
  select
    coalesce((select r.length from runs r, today t where r.last_day >= t.d - 1 order by r.last_day desc limit 1), 0),
    coalesce((select max(r.length) from runs r), 0);
$$;

revoke execute on function private.streaks(uuid) from public, anon, authenticated;

/** Unlocks every achievement the listener has reached; returns the newly unlocked codes. */
create function private.evaluate_achievements(listener uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  metrics jsonb;
  unlocked text[];
begin
  select jsonb_build_object(
    'songs', count(*) filter (where p.kind = 'new_song'),
    'artists', count(*) filter (where p.kind = 'new_artist'),
    'genres', count(*) filter (where p.kind = 'new_genre'),
    'countries', count(*) filter (where p.kind = 'new_country'),
    'saves', count(*) filter (where p.kind = 'save'),
    'longest_streak', (select s.longest_streak from private.streaks(listener) s),
    'deep_genre', coalesce((
      select max(n) from (
        select count(distinct a.artist_id) as n
        from public.discovery_points a
        join public.artist_genres g on g.artist_id = a.artist_id
        where a.user_id = listener and a.kind = 'new_artist'
        group by g.genre_id
      ) per_genre), 0),
    'early_supporter', (
      select count(*) from public.discovery_points a
      where a.user_id = listener and a.kind = 'new_artist' and a.artist_followers_at <= 25
        and (select count(*) from public.artist_follows f where f.artist_id = a.artist_id) >= 100)
  ) into metrics
  from public.discovery_points p
  where p.user_id = listener;

  with fresh as (
    insert into public.user_achievements (user_id, code)
    select listener, a.code from public.achievements a
    where coalesce((metrics ->> a.metric)::integer, 0) >= a.threshold
    on conflict do nothing
    returning code
  )
  select coalesce(array_agg(code), '{}') into unlocked from fresh;
  return unlocked;
end;
$$;

revoke execute on function private.evaluate_achievements(uuid) from public, anon, authenticated;

/** Re-checks the caller's achievements (some, like Early Supporter, unlock while they are away). */
create function public.refresh_my_achievements()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  return private.evaluate_achievements((select auth.uid()));
end;
$$;

revoke execute on function public.refresh_my_achievements() from public, anon;
grant execute on function public.refresh_my_achievements() to authenticated;

-- ---------------------------------------------------------------------------
-- Awards from listening
-- ---------------------------------------------------------------------------

/** New-song awards allowed per rolling minute: faster than this is not listening. */
create function private.max_discoveries_per_minute()
returns integer
language sql
immutable
set search_path = ''
as $$ select 6 $$;

/**
 * What one listen earns. A discovery needs ≥ 15 s actually heard (or a whole preview); replays and
 * skips earn nothing; a full listen pays once per track and day, and only for music discovered in
 * the last 30 days (looping old favourites is not discovery). Returns the awards as JSON:
 * [{kind, points, genre?, country?}, …] plus newly unlocked achievements.
 */
create function private.award_listen(
  listener uuid,
  track uuid,
  ms_played integer,
  completed boolean,
  context text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  awards jsonb := '[]'::jsonb;
  granted integer;
  genre smallint;
  qualifies boolean;
  unlocked text[] := '{}'::text[];
begin
  select tr.id, tr.soundcheck_duration_ms, r.id as release_id, a.id as artist_id, a.country_code
  into t
  from public.tracks tr
  join public.releases r on r.id = tr.release_id
  join public.artists a on a.id = r.artist_id
  where tr.id = track;

  qualifies := ms_played >= 15000
    or (context = 'preview' and completed and ms_played >= coalesce(t.soundcheck_duration_ms, 15000) - 2000);
  if not qualifies then
    return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked));
  end if;

  -- Full listen of recently discovered music (player only).
  if completed and context = 'player' and exists (
    select 1 from public.discovery_points p
    where p.user_id = listener and p.kind = 'new_song' and p.track_id = track
      and p.created_at > now() - interval '30 days'
  ) then
    granted := private.award(listener, 'full_listen',
      track::text || ':' || (now() at time zone private.listener_tz(listener))::date::text, track, t.artist_id);
    if granted is not null then
      awards := awards || jsonb_build_object('kind', 'full_listen', 'points', granted);
    end if;
  end if;

  if exists (select 1 from public.discovery_points p where p.user_id = listener and p.kind = 'new_song' and p.track_id = track) then
    return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked));
  end if;
  if (select count(*) from public.discovery_points p
      where p.user_id = listener and p.kind = 'new_song' and p.created_at > now() - interval '1 minute')
     >= private.max_discoveries_per_minute() then
    return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked), 'throttled', true);
  end if;

  granted := private.award(listener, 'new_song', track::text, track, t.artist_id);
  if granted is null then
    return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked));
  end if;
  awards := awards || jsonb_build_object('kind', 'new_song', 'points', granted);

  granted := private.award(listener, 'new_artist', t.artist_id::text, track, t.artist_id, null, null,
    (select count(*)::integer from public.artist_follows f where f.artist_id = t.artist_id));
  if granted is not null then
    awards := awards || jsonb_build_object('kind', 'new_artist', 'points', granted);
  end if;

  for genre in
    select g.genre_id from public.release_genres g where g.release_id = t.release_id
    union
    select g.genre_id from public.artist_genres g
    where g.artist_id = t.artist_id
      and not exists (select 1 from public.release_genres rg where rg.release_id = t.release_id)
  loop
    granted := private.award(listener, 'new_genre', genre::text, track, t.artist_id, genre);
    if granted is not null then
      awards := awards || jsonb_build_object('kind', 'new_genre', 'points', granted, 'genre', genre);
    end if;
  end loop;

  if t.country_code is not null then
    granted := private.award(listener, 'new_country', t.country_code, track, t.artist_id, null, t.country_code);
    if granted is not null then
      awards := awards || jsonb_build_object('kind', 'new_country', 'points', granted, 'country', t.country_code);
    end if;
  end if;

  unlocked := private.evaluate_achievements(listener);
  return jsonb_build_object('awards', awards, 'achievements', to_jsonb(unlocked));
end;
$$;

revoke execute on function private.award_listen(uuid, uuid, integer, boolean, text) from public, anon, authenticated;

-- record_listen gains a context and returns what the listen earned (was: void).
drop function public.record_listen(uuid, timestamptz, integer, boolean, public.quality_tier);

/**
 * Records one listen of a public track by the caller and returns its awards. Refuses what cannot
 * be true: more time than the track lasts (+30 s slack for buffering), a start in the future or
 * more than a day ago, more than 120 listens a minute.
 */
create function public.record_listen(
  track uuid,
  started_at timestamptz,
  ms_played integer,
  completed boolean default false,
  tier public.quality_tier default null,
  context text default 'player'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  t record;
begin
  if caller is null then
    raise exception 'sign in to keep a history' using errcode = '42501';
  end if;
  if record_listen.context is null or record_listen.context not in ('player', 'preview') then
    raise exception 'unknown listening context' using errcode = '22023';
  end if;
  select tr.id, tr.duration_ms, r.id as release_id, r.artist_id into t
  from public.tracks tr join public.releases r on r.id = tr.release_id
  where tr.id = track;
  if t.id is null or not public.release_is_public(t.release_id) then
    raise exception 'not a public track' using errcode = '42501';
  end if;
  if ms_played < 1000 or ms_played > coalesce(t.duration_ms + 30000, 21600000) then
    raise exception 'implausible listening time' using errcode = '22023';
  end if;
  if record_listen.started_at > now() + interval '1 minute' or record_listen.started_at < now() - interval '1 day' then
    raise exception 'implausible start time' using errcode = '22023';
  end if;
  if (select count(*) from public.listening_events e
      where e.user_id = caller and e.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'too many listens' using errcode = '54000';
  end if;
  insert into public.listening_events (user_id, track_id, release_id, artist_id, started_at, ms_played, completed, tier, context)
  values (caller, track, t.release_id, t.artist_id, record_listen.started_at, record_listen.ms_played,
    coalesce(record_listen.completed, false), record_listen.tier, record_listen.context);
  return private.award_listen(caller, track, record_listen.ms_played, coalesce(record_listen.completed, false), record_listen.context);
end;
$$;

revoke execute on function public.record_listen(uuid, timestamptz, integer, boolean, public.quality_tier, text) from public, anon;
grant execute on function public.record_listen(uuid, timestamptz, integer, boolean, public.quality_tier, text) to authenticated;

-- Recently played lists full plays only; Discover previews would flood it.
create or replace function public.my_recent_tracks(max_results integer default 30)
returns table (track_id uuid, last_played_at timestamptz, plays integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.track_id, max(e.started_at), count(*)::integer
  from public.listening_events e
  where e.user_id = (select auth.uid()) and e.started_at > now() - interval '90 days'
    and e.context = 'player'
  group by e.track_id
  order by max(e.started_at) desc
  limit least(greatest(max_results, 1), 100);
$$;

-- Saving pays once per track, ever: unsave + save again is not a new save.
create function private.award_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.award(new.user_id, 'save', new.track_id::text, new.track_id,
    (select r.artist_id from public.tracks t join public.releases r on r.id = t.release_id where t.id = new.track_id));
  return null;
end;
$$;

create trigger track_saves_award
  after insert on public.track_saves
  for each row execute function private.award_save();

/** A share of a public track by the caller: pays once per track and day. Returns the points. */
create function public.record_share(track uuid, channel text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  t record;
  granted integer;
begin
  if caller is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select tr.id, r.id as release_id, r.artist_id into t
  from public.tracks tr join public.releases r on r.id = tr.release_id where tr.id = track;
  if t.id is null or not public.release_is_public(t.release_id) then
    raise exception 'not a public track' using errcode = '42501';
  end if;
  granted := private.award(caller, 'share',
    track::text || ':' || (now() at time zone private.listener_tz(caller))::date::text, track, t.artist_id);
  insert into private.product_events (user_id, name, track_id, artist_id, reason)
  values (caller, 'share_clicked', track, t.artist_id, left(channel, 40));
  return coalesce(granted, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Product events (analytics for discovery quality). Signed-in only, no IP/UA, 180 days.
-- ---------------------------------------------------------------------------
create table private.product_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null constraint product_events_name check (name in (
    'song_impression', 'preview_started', 'preview_completed', 'song_played', 'song_skipped',
    'song_liked', 'song_saved', 'artist_followed', 'share_clicked', 'artist_opened', 'search',
    'recommendation_clicked', 'discovery_completed', 'goal_completed', 'achievement_unlocked',
    'ranking_viewed', 'weekly_recap_viewed', 'onboarding_completed'
  )),
  track_id uuid,
  artist_id uuid,
  mode text constraint product_events_mode check (char_length(mode) <= 20),
  position smallint,
  reason text constraint product_events_reason check (char_length(reason) <= 40),
  ms integer constraint product_events_ms check (ms between 0 and 21600000),
  created_at timestamptz not null default now()
);

create index product_events_user_idx on private.product_events (user_id, created_at desc);
create index product_events_track_idx on private.product_events (track_id, name, created_at) where track_id is not null;
create index product_events_created_idx on private.product_events (created_at);

revoke execute on function public.record_share(uuid, text) from public, anon;
grant execute on function public.record_share(uuid, text) to authenticated;

/**
 * Records up to 50 product events of the caller in one call (the feed batches them). Unknown
 * names are refused; more than 600 events a minute are dropped, not stored.
 */
create function public.record_events(events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  stored integer;
begin
  if caller is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if jsonb_typeof(events) <> 'array' or jsonb_array_length(events) > 50 then
    raise exception 'events must be an array of at most 50' using errcode = '22023';
  end if;
  if (select count(*) from private.product_events e
      where e.user_id = caller and e.created_at > now() - interval '1 minute') >= 600 then
    return 0;
  end if;
  insert into private.product_events (user_id, name, track_id, artist_id, mode, position, reason, ms)
  select caller, e ->> 'name',
    case when (e ->> 'track') ~ '^[0-9a-f-]{36}$' then (e ->> 'track')::uuid end,
    case when (e ->> 'artist') ~ '^[0-9a-f-]{36}$' then (e ->> 'artist')::uuid end,
    left(e ->> 'mode', 20),
    case when (e ->> 'position') ~ '^[0-9]{1,4}$' then (e ->> 'position')::smallint end,
    left(e ->> 'reason', 40),
    case when (e ->> 'ms') ~ '^[0-9]{1,8}$' then least((e ->> 'ms')::integer, 21600000) end
  from jsonb_array_elements(events) e;
  get diagnostics stored = row_count;
  return stored;
end;
$$;

revoke execute on function public.record_events(jsonb) from public, anon;
grant execute on function public.record_events(jsonb) to authenticated;

/** Retention: deletes product events older than 180 days. Run daily (docs/deployment.md). */
create function private.prune_product_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.product_events e where e.created_at < now() - interval '180 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function private.prune_product_events() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reports (docs/database.md §3.8): songs, releases, artists, users. Decided by staff.
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references auth.users (id) on delete set null,
  subject_type text not null constraint reports_subject_type check (subject_type in ('track', 'release', 'artist', 'user')),
  subject_id uuid not null,
  category text not null constraint reports_category check (category in (
    'copyright', 'inappropriate', 'spam', 'impersonation', 'other'
  )),
  details text constraint reports_details_length check (char_length(details) <= 2000),
  status text not null default 'open' constraint reports_status check (status in ('open', 'actioned', 'dismissed')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index reports_subject_idx on public.reports (subject_type, subject_id);

create function private.limit_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.reports r
      where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many reports today' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger reports_limit
  before insert on public.reports
  for each row execute function private.limit_reports();

alter table public.reports enable row level security;
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy reports_read_own_or_staff on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_staff());

revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (subject_type, subject_id, category, details) on public.reports to authenticated;

/** Staff decision on a report (audited). */
create function public.decide_report(report uuid, decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'multi-factor authentication required' using errcode = '42501', hint = 'mfa_required';
  end if;
  if decision not in ('actioned', 'dismissed') then
    raise exception 'unknown decision' using errcode = '22023';
  end if;
  update public.reports r
  set status = decision, decided_by = (select auth.uid()), decided_at = now()
  where r.id = report and r.status = 'open';
  if not found then
    raise exception 'no open report' using errcode = 'P0002';
  end if;
  perform private.write_audit('report.' || decision, 'report', report::text);
end;
$$;

revoke execute on function public.decide_report(uuid, text) from public, anon;
grant execute on function public.decide_report(uuid, text) to authenticated;
