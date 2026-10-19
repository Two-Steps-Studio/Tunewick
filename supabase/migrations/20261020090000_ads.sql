-- Ads: first-party, contextual sponsor cards for listeners on the Free plan.
--
-- No ad network, no tracking: a card is chosen from active campaigns by placement and language
-- only, never by who is looking, and the statistics are anonymous daily counts. Premium never sees
-- ads. A campaign either promotes a release on Tunewick (its artwork, links to its page) or links
-- to an external https address. Where cards may appear is decided in the app (docs/ads.md): never
-- in the player, the Discover feed, artist, release or playlist pages, or embeds.

create type public.ad_placement as enum ('library', 'charts', 'browse', 'scene');

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser text not null constraint ad_campaigns_advertiser check (char_length(advertiser) between 1 and 80),
  headline text not null constraint ad_campaigns_headline check (char_length(headline) between 1 and 80),
  body text constraint ad_campaigns_body check (char_length(body) <= 160),
  cta text not null constraint ad_campaigns_cta check (char_length(cta) between 1 and 24),
  url text constraint ad_campaigns_url check (url ~ '^https://[^\s/$.?#][^\s]*$' and char_length(url) <= 500),
  release_id uuid references public.releases (id) on delete cascade,
  placements public.ad_placement[] not null constraint ad_campaigns_placements check (cardinality(placements) between 1 and 4),
  -- Interface languages the card is written for; empty = every language.
  locales text[] not null default '{}' constraint ad_campaigns_locales check (
    cardinality(locales) <= 6 and locales <@ array['pl', 'en', 'de', 'es', 'fr', 'pt']),
  weight smallint not null default 1 constraint ad_campaigns_weight check (weight between 1 and 10),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaigns_target check ((url is null) <> (release_id is null)),
  constraint ad_campaigns_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

alter table public.ad_campaigns enable row level security;
revoke all on public.ad_campaigns from anon, authenticated;
-- No policies: campaigns are read through public.ad_for and the admin functions only.

create trigger ad_campaigns_updated_at before update on public.ad_campaigns
  for each row execute function private.set_updated_at();

/** Anonymous daily counts per campaign and placement. */
create table private.ad_stats (
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Warsaw')::date,
  placement public.ad_placement not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  primary key (campaign_id, day, placement)
);

/** Whether the caller sees ads: visitors and listeners on the Free plan. */
create function private.sees_ads()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is null
    or coalesce((select e.plan_code = 'free' from private.effective_plan((select auth.uid())) e limit 1), true);
$$;

revoke execute on function private.sees_ads() from public, anon, authenticated;

/**
 * One sponsor card for `placement` in `locale`, or nothing (Premium, no campaign). Weighted random
 * among the campaigns running now; a promoted release must still be public.
 */
create function public.ad_for(placement public.ad_placement, locale text)
returns table (
  id uuid, advertiser text, headline text, body text, cta text, url text,
  release_id uuid, release_slug text, artist_slug text, artwork_image_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.advertiser, c.headline, c.body, c.cta, c.url,
    r.id, r.slug::text, a.slug::text, r.artwork_image_id
  from public.ad_campaigns c
  left join public.releases r on r.id = c.release_id
  left join public.artists a on a.id = r.artist_id
  where private.sees_ads()
    and c.active
    and ad_for.placement = any (c.placements)
    and (cardinality(c.locales) = 0 or ad_for.locale = any (c.locales))
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now())
    and (c.release_id is null or public.release_is_public(c.release_id))
  order by -ln(1.0 - random()) / c.weight
  limit 1;
$$;

revoke execute on function public.ad_for(public.ad_placement, text) from public;
grant execute on function public.ad_for(public.ad_placement, text) to anon, authenticated;

/** Counts an impression or a click (anonymous; only for a campaign that is running). */
create function public.record_ad_event(campaign uuid, placement public.ad_placement, kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if kind not in ('impression', 'click') then
    raise exception 'unknown ad event' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.ad_campaigns c
    where c.id = record_ad_event.campaign and c.active
      and record_ad_event.placement = any (c.placements)
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
  ) then
    return;
  end if;
  insert into private.ad_stats as s (campaign_id, placement, impressions, clicks)
  values (campaign, placement, (kind = 'impression')::integer, (kind = 'click')::integer)
  on conflict on constraint ad_stats_pkey do update
    set impressions = s.impressions + excluded.impressions, clicks = s.clicks + excluded.clicks;
end;
$$;

revoke execute on function public.record_ad_event(uuid, public.ad_placement, text) from public;
grant execute on function public.record_ad_event(uuid, public.ad_placement, text) to anon, authenticated;

-- Admin ------------------------------------------------------------------------------------------

/** Every campaign with its totals for the last 30 days. */
create function public.admin_ad_campaigns()
returns table (
  id uuid, advertiser text, headline text, body text, cta text, url text, release_id uuid,
  release_title text, release_ref text, placements public.ad_placement[], locales text[], weight smallint,
  starts_at timestamptz, ends_at timestamptz, active boolean, impressions bigint, clicks bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  return query
  select c.id, c.advertiser, c.headline, c.body, c.cta, c.url, c.release_id, r.title,
    a.slug::text || '/' || r.slug::text, c.placements, c.locales, c.weight, c.starts_at, c.ends_at, c.active,
    coalesce(sum(s.impressions), 0)::bigint, coalesce(sum(s.clicks), 0)::bigint
  from public.ad_campaigns c
  left join public.releases r on r.id = c.release_id
  left join public.artists a on a.id = r.artist_id
  left join private.ad_stats s on s.campaign_id = c.id and s.day > current_date - 30
  group by c.id, r.title, a.slug, r.slug
  order by c.active desc, c.created_at desc;
end;
$$;

/**
 * Creates (`campaign` null) or updates a campaign. `release_slug` as "artist/release" promotes a
 * release; otherwise `url` is the destination. New campaigns start paused.
 */
create function public.admin_save_ad_campaign(
  campaign uuid,
  advertiser text,
  headline text,
  body text,
  cta text,
  url text,
  release_ref text,
  placements public.ad_placement[],
  locales text[],
  weight smallint,
  starts_at timestamptz,
  ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_release uuid;
  saved uuid;
begin
  perform public.require_staff('admin');
  if nullif(trim(release_ref), '') is not null then
    select r.id into target_release
    from public.releases r join public.artists a on a.id = r.artist_id
    where a.slug = split_part(trim(release_ref), '/', 1) and r.slug = split_part(trim(release_ref), '/', 2);
    if target_release is null then
      raise exception 'release not found' using errcode = 'P0002';
    end if;
  end if;

  if campaign is null then
    insert into public.ad_campaigns (advertiser, headline, body, cta, url, release_id, placements,
      locales, weight, starts_at, ends_at, created_by)
    values (trim(advertiser), trim(headline), nullif(trim(body), ''), trim(cta),
      case when target_release is null then nullif(trim(url), '') end, target_release, placements,
      coalesce(locales, '{}'), coalesce(weight, 1), starts_at, ends_at, (select auth.uid()))
    returning id into saved;
    perform private.write_audit('ads.campaign_created', 'ad_campaign', saved::text, null,
      jsonb_build_object('advertiser', trim(advertiser), 'headline', trim(headline)));
  else
    update public.ad_campaigns c set
      advertiser = trim(admin_save_ad_campaign.advertiser),
      headline = trim(admin_save_ad_campaign.headline),
      body = nullif(trim(admin_save_ad_campaign.body), ''),
      cta = trim(admin_save_ad_campaign.cta),
      url = case when target_release is null then nullif(trim(admin_save_ad_campaign.url), '') end,
      release_id = target_release,
      placements = admin_save_ad_campaign.placements,
      locales = coalesce(admin_save_ad_campaign.locales, '{}'),
      weight = coalesce(admin_save_ad_campaign.weight, 1),
      starts_at = admin_save_ad_campaign.starts_at,
      ends_at = admin_save_ad_campaign.ends_at
    where c.id = campaign
    returning c.id into saved;
    if saved is null then
      raise exception 'campaign not found' using errcode = 'P0002';
    end if;
    perform private.write_audit('ads.campaign_updated', 'ad_campaign', saved::text, null,
      jsonb_build_object('advertiser', trim(advertiser), 'headline', trim(headline)));
  end if;
  return saved;
end;
$$;

/** Starts or pauses a campaign. */
create function public.admin_set_ad_campaign_active(campaign uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('admin');
  update public.ad_campaigns c set active = admin_set_ad_campaign_active.active where c.id = campaign;
  if not found then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  perform private.write_audit(case when active then 'ads.campaign_started' else 'ads.campaign_paused' end,
    'ad_campaign', campaign::text);
end;
$$;

revoke execute on function public.admin_ad_campaigns() from public, anon;
revoke execute on function public.admin_save_ad_campaign(uuid, text, text, text, text, text, text,
  public.ad_placement[], text[], smallint, timestamptz, timestamptz) from public, anon;
revoke execute on function public.admin_set_ad_campaign_active(uuid, boolean) from public, anon;
grant execute on function public.admin_ad_campaigns() to authenticated;
grant execute on function public.admin_save_ad_campaign(uuid, text, text, text, text, text, text,
  public.ad_placement[], text[], smallint, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_set_ad_campaign_active(uuid, boolean) to authenticated;

-- Statistics older than two years are of no use to anyone.
select cron.schedule('ad-stats-retention', '17 4 * * *',
  $$delete from private.ad_stats where day < current_date - 730$$);
