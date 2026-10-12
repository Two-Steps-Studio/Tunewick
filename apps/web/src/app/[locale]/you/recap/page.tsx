import type { Metadata } from "next";
import { discoveryScore, musicPersonality } from "@tunewick/shared";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatListening, songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import { getOptionalUser } from "@/modules/auth";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import {
  getMyMonthRecap,
  getMyToday,
  parseMonth,
  shiftMonth,
  type ListeningStats,
} from "@/modules/progress";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/you/recap">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Recap" });
  return { title: t("title") };
}

const CARDS = ["summary", "artist", "song", "discovery", "score"] as const;

function personalityOf(stats: ListeningStats) {
  return musicPersonality({
    plays: Number(stats.plays),
    tracks: Number(stats.tracks),
    artists: Number(stats.artists),
    countries: Number(stats.countries),
    night_plays: Number(stats.night_plays),
    new_artists: Number(stats.new_artists),
    underground: Number(stats.underground),
    top_genres: stats.top_genres.map((g) => ({ plays: Number(g.plays) })),
  });
}

/** A month in music: numbers, #1 artist and song, the biggest discovery, and share cards. */
export default async function RecapPage({
  params,
  searchParams,
}: PageProps<"/[locale]/you/recap">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Recap");
  const user = await getOptionalUser();
  if (!user) {
    return (
      <section className="stats">
        <h1 className="stats__title">{t("title")}</h1>
        <p className="stats__lead">{t("signedOut")}</p>
        <Link href="/login" className="button button--primary">
          {t("signIn")}
        </Link>
      </section>
    );
  }

  const query = await searchParams;
  const today = await getMyToday();
  const thisMonth = `${today.slice(0, 7)}-01`;
  // Default: last month, the finished one; the running month is a link away.
  const month = parseMonth(query.m) ?? `${shiftMonth(thisMonth, -1)}-01`;
  const [recap, format] = await Promise.all([getMyMonthRecap(month), getFormatter()]);
  const n = (value: number) => format.number(Number(value));
  const monthName = format.dateTime(new Date(`${month}T12:00:00Z`), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const running = month === thisMonth;
  const genreName = (g: { name_pl: string; name_en: string }) =>
    locale === "pl" ? g.name_pl : g.name_en;

  const nav = (
    <nav className="recap-nav" aria-label={t("months")}>
      <Link href={{ pathname: "/you/recap", query: { m: prev } }} rel="prev">
        {t("previous")}
      </Link>
      {`${next}-01` <= thisMonth ? (
        <Link href={{ pathname: "/you/recap", query: { m: next } }} rel="next">
          {t("next")}
        </Link>
      ) : null}
    </nav>
  );

  if (!recap || Number(recap.plays) === 0) {
    return (
      <section className="stats">
        <header className="stats__head">
          <p className="stats__back">
            <Link href="/you">{t("back")}</Link>
          </p>
          <h1 className="stats__title">{t("heading", { month: monthName })}</h1>
          {nav}
        </header>
        <div className="empty-state">
          <p>{recap ? t("empty") : t("outside")}</p>
          <Link href="/" className="button button--primary">
            {t("startListening")}
          </Link>
        </div>
      </section>
    );
  }

  const images = await getImageSourcesMany(
    [
      ...recap.top_artists.map((a) => a.image_id),
      ...recap.top_tracks.map((s) => s.artwork_image_id),
      recap.biggest_discovery?.image_id ?? null,
    ],
    320,
  );
  const image = (id: string | null) => (id ? (images.get(id) ?? null) : null);
  const score = discoveryScore(Number(recap.discovery_xp), recap.genre_spread);
  const personality = personalityOf(recap);
  const topArtist = recap.top_artists[0];
  const topSong = recap.top_tracks[0];
  const found = recap.biggest_discovery;
  const available = (kind: (typeof CARDS)[number]) =>
    kind === "artist"
      ? Boolean(topArtist)
      : kind === "song"
        ? Boolean(topSong)
        : kind === "discovery"
          ? Boolean(found)
          : true;
  const cardUrl = (kind: string, size: "story" | "square") =>
    `/api/cards/recap?month=${month.slice(0, 7)}&kind=${kind}&format=${size}&locale=${locale}`;

  return (
    <section className="stats recap-month">
      <header className="stats__head">
        <p className="stats__back">
          <Link href="/you">{t("back")}</Link>
        </p>
        <h1 className="stats__title">{t("heading", { month: monthName })}</h1>
        {running ? <p className="stats__lead">{t("running")}</p> : null}
        {nav}
      </header>

      <dl className="stat-grid">
        {(
          [
            ["listening", formatListening(Number(recap.listening_ms))],
            ["songs", n(recap.tracks)],
            ["artists", n(recap.artists)],
            ["newArtists", n(recap.new_artists)],
            ["countries", n(recap.countries)],
            ["score", n(score)],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="stat-tile">
            <dt>{t(`labels.${key}`)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="recap-highlights">
        {topArtist ? (
          <article className="recap-highlight">
            <Artwork
              image={image(topArtist.image_id)}
              alt=""
              sizes="120px"
              className="recap-highlight__art recap-highlight__art--round"
            />
            <p className="recap-highlight__kicker">{t("card.topArtist")}</p>
            <h2 className="recap-highlight__title">
              <Link href={{ pathname: "/artists/[slug]", params: { slug: topArtist.slug } }}>
                {topArtist.name}
              </Link>
            </h2>
            <p className="recap-highlight__meta">
              {t("card.plays", { count: Number(topArtist.plays) })}
            </p>
          </article>
        ) : null}
        {topSong ? (
          <article className="recap-highlight">
            <Artwork
              image={image(topSong.artwork_image_id)}
              alt=""
              sizes="120px"
              className="recap-highlight__art"
            />
            <p className="recap-highlight__kicker">{t("card.topSong")}</p>
            <h2 className="recap-highlight__title">
              <Link
                href={{
                  pathname: "/song/[artist]/[song]",
                  params: {
                    artist: topSong.artist_slug,
                    song: songSegment(topSong.title, topSong.code, slugify),
                  },
                }}
              >
                {topSong.title}
              </Link>
            </h2>
            <p className="recap-highlight__meta">
              {topSong.artist} · {t("card.plays", { count: Number(topSong.plays) })}
            </p>
          </article>
        ) : null}
        {found ? (
          <article className="recap-highlight">
            <Artwork
              image={image(found.image_id)}
              alt=""
              sizes="120px"
              className="recap-highlight__art recap-highlight__art--round"
            />
            <p className="recap-highlight__kicker">{t("card.discovery")}</p>
            <h2 className="recap-highlight__title">
              <Link href={{ pathname: "/artists/[slug]", params: { slug: found.slug } }}>
                {found.name}
              </Link>
            </h2>
            <p className="recap-highlight__meta">
              {t("card.since", { time: formatListening(Number(found.ms)) })}
            </p>
          </article>
        ) : null}
        {personality ? (
          <article className="recap-highlight recap-highlight--text">
            <p className="recap-highlight__kicker">{t("personality")}</p>
            <h2 className="recap-highlight__title">
              {t(`personalities.${personality.personality}`)}
            </h2>
            {recap.top_genres[0] ? (
              <p className="recap-highlight__meta">
                {t("topGenre", { genre: genreName(recap.top_genres[0]) })}
              </p>
            ) : null}
          </article>
        ) : null}
      </div>

      <section aria-labelledby="share" className="stats__section">
        <h2 id="share" className="section-title">
          {t("share.title")}
        </h2>
        <p className="field__hint">{t("share.hint")}</p>
        <ul className="recap-cards">
          {CARDS.filter(available).map((kind) => (
            <li key={kind} className="recap-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated per listener, private */}
              <img
                src={cardUrl(kind, "square")}
                alt={t(`share.kinds.${kind}`)}
                loading="lazy"
                width={540}
                height={540}
              />
              <p className="recap-card__name">{t(`share.kinds.${kind}`)}</p>
              <p className="recap-card__links">
                <a
                  href={cardUrl(kind, "story")}
                  download={`tunewick-${month.slice(0, 7)}-${kind}-story.png`}
                >
                  {t("share.story")}
                </a>
                <a
                  href={cardUrl(kind, "square")}
                  download={`tunewick-${month.slice(0, 7)}-${kind}.png`}
                >
                  {t("share.square")}
                </a>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <p>
        <Link href={{ pathname: "/you/stats" }} className="button">
          {t("allStats")}
        </Link>
      </p>
    </section>
  );
}
