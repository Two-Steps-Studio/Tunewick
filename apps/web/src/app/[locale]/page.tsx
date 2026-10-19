import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { alternates } from "@/lib/site";
import { getOptionalUser } from "@/modules/auth";
import { ChartPlay, getFreshReleases, getTrackChart, PlayTracks } from "@/modules/charts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import { getFollowedNewReleases, getLibrary, getRecentlyPlayed } from "@/modules/library";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Home" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: alternates("/", locale as Locale),
  };
}

/** Feed links from before Discover had its own address (shared on social media) still work. */
const FEED_PARAMS = ["start", "artist", "journey", "similar", "set"] as const;
const GLOBAL = { scope: "global", code: null, country: null } as const;

interface Pick {
  trackId: string;
  title: string;
  artistName: string;
  artistSlug: string;
  releaseSlug: string;
  artworkImageId: string | null;
}

/**
 * What to play first for everyone: this week's most played tracks, or - while the week is quiet
 * (a new catalog, a new region) - the opening track of each release from the last 30 days.
 */
async function listenNow(): Promise<{ source: "popular" | "new"; picks: Pick[] }> {
  const popular = await getTrackChart("top", GLOBAL, 12).catch(() => []);
  if (popular.length) {
    const picks = popular.map((row) => ({
      trackId: row.track_id,
      title: row.title,
      artistName: row.artist_name,
      artistSlug: row.artist_slug,
      releaseSlug: row.release_slug,
      artworkImageId: row.artwork_image_id,
    }));
    return { source: "popular", picks };
  }
  const releases = (await getFreshReleases(720, null, null).catch(() => [])).slice(0, 12);
  if (!releases.length) return { source: "new", picks: [] };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tracks")
    .select("id, title, release_id, track_number")
    .in(
      "release_id",
      releases.map((r) => r.release_id),
    )
    .order("track_number");
  const first = new Map<string, { id: string; title: string }>();
  for (const track of data ?? [])
    if (!first.has(track.release_id)) first.set(track.release_id, track);
  const picks = releases.flatMap((r) => {
    const track = first.get(r.release_id);
    return track
      ? [
          {
            trackId: track.id,
            title: track.title,
            artistName: r.artist_name,
            artistSlug: r.artist_slug,
            releaseSlug: r.slug,
            artworkImageId: r.artwork_image_id,
          },
        ]
      : [];
  });
  return { source: "new", picks };
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * Listen - the first thing on Tunewick is music that is already here: your own (recently played,
 * liked) or, for a first visit, what people play this week. Discovering comes next, one tap away.
 */
export default async function ListenPage({ params, searchParams }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const query = await searchParams;
  if (FEED_PARAMS.some((key) => typeof query[key] === "string")) {
    const feedQuery = Object.fromEntries(
      FEED_PARAMS.flatMap((key) => (typeof query[key] === "string" ? [[key, query[key]]] : [])),
    );
    redirect({ href: { pathname: "/discover", query: feedQuery }, locale: locale as Locale });
  }

  const t = await getTranslations("Home");
  const tFeed = await getTranslations("Feed");
  const user = await getOptionalUser();
  // Independent lookups side by side: each sequential step is a round trip to the database.
  const [{ source, picks: popular }, recent, library, fresh] = await Promise.all([
    listenNow(),
    user ? getRecentlyPlayed().catch(() => []) : [],
    user ? getLibrary().catch(() => null) : null,
    user ? getFollowedNewReleases().catch(() => []) : [],
  ]);

  // Recently played, one card per release, most recent first.
  const recentReleases = [
    ...new Map(recent.map((track) => [track.release.id, track.release])).values(),
  ].slice(0, 8);
  const liked = library?.tracks ?? [];
  const yours = [...new Set([...recent.map((r) => r.id), ...liked.map((l) => l.id)])];
  const popularIds = popular.map((pick) => pick.trackId);
  const mainQueue = yours.length ? yours : popularIds;
  const images = await getImageSourcesMany(
    [
      ...recentReleases.map((r) => r.artwork_image_id),
      ...fresh.map((r) => r.artwork_image_id),
      ...popular.map((pick) => pick.artworkImageId),
    ],
    320,
  );
  const art = (id: string | null) => (id ? (images.get(id) ?? null) : null);
  const deleted = query.konto === "usuniete";
  const playLabel = yours.length
    ? t("playYours")
    : source === "popular"
      ? t("playPopular")
      : t("playNewest");

  return (
    <section className="discover listen">
      {deleted ? (
        <p role="status" className="form-status feed-status">
          {tFeed("accountDeleted")}
        </p>
      ) : null}
      <header className="discover__head listen__head">
        <h1 className="discover__title">{t("title")}</h1>
        <p className="discover__lead">
          {yours.length
            ? t("leadYours")
            : source === "popular"
              ? t("leadPopular")
              : t("leadNewest")}
        </p>
        <div className="listen__actions">
          {mainQueue.length ? (
            <PlayTracks
              trackIds={mainQueue}
              label={playLabel}
              className="button button--primary listen__play"
            >
              <PlayIcon />
              {playLabel}
            </PlayTracks>
          ) : null}
          <Link href="/discover" className="button">
            {t("discover")}
          </Link>
        </div>
      </header>

      {recentReleases.length ? (
        <section aria-labelledby="recent" className="discover__section">
          <h2 id="recent" className="section-title">
            {t("recent")}
          </h2>
          <ul className="release-grid">
            {recentReleases.map((r) => (
              <li key={r.id} className="release-card">
                <Link
                  href={{
                    pathname: "/artists/[slug]/releases/[release]",
                    params: { slug: r.artist.slug, release: r.slug },
                  }}
                  className="release-card__link"
                >
                  <Artwork
                    image={art(r.artwork_image_id)}
                    alt=""
                    sizes="(min-width: 1024px) 14rem, 45vw"
                  />
                  <span className="release-card__title">{r.title}</span>
                </Link>
                <span className="release-card__artist">{r.artist.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {fresh.length ? (
        <section aria-labelledby="fresh" className="discover__section">
          <h2 id="fresh" className="section-title">
            {t("fresh")}
          </h2>
          <ul className="release-grid">
            {fresh.slice(0, 8).map((r) => (
              <li key={r.id} className="release-card">
                <Link
                  href={{
                    pathname: "/artists/[slug]/releases/[release]",
                    params: { slug: r.artist.slug, release: r.slug },
                  }}
                  className="release-card__link"
                >
                  <Artwork
                    image={art(r.artwork_image_id)}
                    alt=""
                    sizes="(min-width: 1024px) 14rem, 45vw"
                  />
                  <span className="release-card__title">{r.title}</span>
                </Link>
                <span className="release-card__artist">{r.artist.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {popular.length ? (
        <section aria-labelledby="popular" className="discover__section">
          <h2 id="popular" className="section-title">
            {t(source === "popular" ? "popular" : "newest")}
          </h2>
          <ul className="release-grid">
            {popular.map((pick, index) => (
              <li key={pick.trackId} className="release-card listen__track">
                <Link
                  href={{
                    pathname: "/artists/[slug]/releases/[release]",
                    params: { slug: pick.artistSlug, release: pick.releaseSlug },
                  }}
                  className="release-card__link"
                >
                  <Artwork
                    image={art(pick.artworkImageId)}
                    alt=""
                    sizes="(min-width: 1024px) 14rem, 45vw"
                  />
                  <span className="release-card__title">{pick.title}</span>
                </Link>
                <span className="release-card__artist">{pick.artistName}</span>
                <ChartPlay
                  trackIds={popularIds.slice(index)}
                  label={t("playFrom", { title: pick.title, artist: pick.artistName })}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="next" className="listen__next">
        <h2 id="next" className="section-title">
          {t("nextTitle")}
        </h2>
        <p className="discover__lead">{t("nextLead")}</p>
        <Link href="/discover" className="button button--primary">
          {t("discover")}
        </Link>
      </section>
    </section>
  );
}
