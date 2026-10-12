import type { Metadata } from "next";
import { replayStory, type ReplayScreen } from "@tunewick/shared";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji, formatListening } from "@/lib/intl";
import { getOptionalUser } from "@/modules/auth";
import { Artwork, getImageSourcesMany } from "@/modules/images";
import { getMyReplay, getMyToday, ReplayPlayer } from "@/modules/progress";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/you/replay">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Replay" });
  return { title: t("title") };
}

function imageIds(screens: ReplayScreen[]): (string | null)[] {
  return screens.flatMap((s) => {
    switch (s.kind) {
      case "first_song":
        return [s.song.artwork_image_id];
      case "top_artist":
      case "discovery":
        return [s.artist.image_id];
      case "top_artists":
        return s.artists.map((a) => a.image_id);
      case "top_song":
        return [s.song.artwork_image_id];
      case "top_songs":
        return s.songs.map((x) => x.artwork_image_id);
      case "top_album":
        return [s.album.artwork_image_id];
      default:
        return [];
    }
  });
}

/** TuneWick Replay: the listener's year as a story, then the year compared with the one before. */
export default async function ReplayPage({
  params,
  searchParams,
}: PageProps<"/[locale]/you/replay">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Replay");
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
  const thisYear = Number(today.slice(0, 4));
  const asked = Number(query.y);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= thisYear ? asked : thisYear;
  const [data, format] = await Promise.all([getMyReplay(year), getFormatter()]);
  const story = data ? replayStory(data) : [];
  const n = (value: number) => format.number(Number(value));
  const years = (
    <nav className="recap-nav" aria-label={t("years")}>
      <Link href={{ pathname: "/you/replay", query: { y: String(year - 1) } }} rel="prev">
        {t("previous", { year: year - 1 })}
      </Link>
      {year < thisYear ? (
        <Link href={{ pathname: "/you/replay", query: { y: String(year + 1) } }} rel="next">
          {t("next", { year: year + 1 })}
        </Link>
      ) : null}
    </nav>
  );

  if (!story.length) {
    return (
      <section className="stats">
        <header className="stats__head">
          <p className="stats__back">
            <Link href="/you">{t("back")}</Link>
          </p>
          <h1 className="stats__title">{t("heading", { year })}</h1>
          {years}
        </header>
        <div className="empty-state">
          <p>{data ? t("tooLittle") : t("outside")}</p>
          <Link href="/" className="button button--primary">
            {t("startListening")}
          </Link>
        </div>
      </section>
    );
  }

  const images = await getImageSourcesMany(imageIds(story), 480);
  const image = (id: string | null) => (id ? (images.get(id) ?? null) : null);
  const date = (day: string, style: "long" | "month") =>
    format.dateTime(
      new Date(`${day}T12:00:00Z`),
      style === "long"
        ? { dateStyle: "long", timeZone: "UTC" }
        : { month: "long", timeZone: "UTC" },
    );
  const monthName = (month: number) => date(`2024-${String(month).padStart(2, "0")}-01`, "month");
  const genreName = (g: { name_pl: string; name_en: string }) =>
    locale === "pl" ? g.name_pl : g.name_en;
  const change = (before: number, after: number) =>
    before > 0
      ? format.number((after - before) / before, { style: "percent", signDisplay: "always" })
      : "";

  const Title = ({ children }: { children: ReactNode }) => (
    <h2 className="replay__title" tabIndex={-1}>
      {children}
    </h2>
  );
  const Big = ({ children }: { children: ReactNode }) => <p className="replay__big">{children}</p>;
  const Note = ({ children }: { children: ReactNode }) => (
    <p className="replay__note">{children}</p>
  );

  const render = (s: ReplayScreen): ReactNode => {
    switch (s.kind) {
      case "intro":
        return (
          <>
            <p className="replay__eyebrow">TuneWick Replay</p>
            <Title>{t("intro.title", { year: s.year })}</Title>
            <Note>{s.complete ? t("intro.complete") : t("intro.soFar")}</Note>
          </>
        );
      case "minutes":
        return (
          <>
            <Title>{t("minutes.title")}</Title>
            <Big>{n(Math.round(s.ms / 60000))}</Big>
            <Note>{t("minutes.note", { time: formatListening(s.ms), days: s.activeDays })}</Note>
          </>
        );
      case "first_song":
        return (
          <>
            <Title>{t("firstSong.title")}</Title>
            <Artwork
              image={image(s.song.artwork_image_id)}
              alt=""
              sizes="240px"
              className="replay__art"
            />
            <Big>{s.song.title}</Big>
            <Note>
              {t("firstSong.note", { artist: s.song.artist, date: date(s.song.at, "long") })}
            </Note>
          </>
        );
      case "top_month": {
        const max = Math.max(1, ...s.months.map((m) => m.ms));
        return (
          <>
            <Title>{t("topMonth.title")}</Title>
            <Big>{monthName(s.month)}</Big>
            <div className="replay__months" role="img" aria-label={t("topMonth.chart")}>
              {s.months.map((m) => (
                <span
                  key={m.month}
                  className={m.month === s.month ? "is-top" : undefined}
                  style={{ height: `${Math.max(2, (m.ms / max) * 100)}%` }}
                  title={`${monthName(m.month)}: ${formatListening(m.ms)}`}
                />
              ))}
            </div>
            <Note>{t("topMonth.note", { time: formatListening(s.ms) })}</Note>
          </>
        );
      }
      case "top_day":
        return (
          <>
            <Title>{t("topDay.title")}</Title>
            <Big>{date(s.day, "long")}</Big>
            <Note>{t("topDay.note", { time: formatListening(s.ms) })}</Note>
          </>
        );
      case "top_artist":
        return (
          <>
            <Title>{t("topArtist.title")}</Title>
            <Artwork
              image={image(s.artist.image_id)}
              alt=""
              sizes="240px"
              className="replay__art replay__art--round"
            />
            <Big>
              <Link href={{ pathname: "/artists/[slug]", params: { slug: s.artist.slug } }}>
                {s.artist.name}
              </Link>
            </Big>
            <Note>{t("plays", { count: Number(s.artist.plays) })}</Note>
          </>
        );
      case "top_artists":
        return (
          <>
            <Title>{t("topArtists.title")}</Title>
            <ol className="replay__list">
              {s.artists.map((a) => (
                <li key={a.slug}>
                  <span>{a.name}</span>
                  <small>{t("plays", { count: Number(a.plays) })}</small>
                </li>
              ))}
            </ol>
          </>
        );
      case "top_song":
        return (
          <>
            <Title>{t("topSong.title")}</Title>
            <Artwork
              image={image(s.song.artwork_image_id)}
              alt=""
              sizes="240px"
              className="replay__art"
            />
            <Big>{s.song.title}</Big>
            <Note>
              {s.song.artist} · {t("plays", { count: Number(s.song.plays) })}
            </Note>
          </>
        );
      case "top_songs":
        return (
          <>
            <Title>{t("topSongs.title")}</Title>
            <ol className="replay__list">
              {s.songs.map((x) => (
                <li key={`${x.code}-${x.title}`}>
                  <span>{x.title}</span>
                  <small>{x.artist}</small>
                </li>
              ))}
            </ol>
          </>
        );
      case "top_album":
        return (
          <>
            <Title>{t("topAlbum.title")}</Title>
            <Artwork
              image={image(s.album.artwork_image_id)}
              alt=""
              sizes="240px"
              className="replay__art"
            />
            <Big>{s.album.title}</Big>
            <Note>{s.album.artist}</Note>
          </>
        );
      case "top_genre":
        return (
          <>
            <Title>{t("topGenre.title")}</Title>
            <Big>{genreName(s.genre)}</Big>
            <Note>{t("topGenre.note", { count: s.genres })}</Note>
          </>
        );
      case "countries":
        return (
          <>
            <Title>{t("countries.title")}</Title>
            <Big>{n(s.count)}</Big>
            <ul className="replay__flags">
              {s.countries.map((c) => (
                <li key={c.code}>
                  {flagEmoji(c.code)} {countryName(c.code, locale)}
                </li>
              ))}
            </ul>
          </>
        );
      case "new_artists":
        return (
          <>
            <Title>{t("newArtists.title")}</Title>
            <Big>{n(s.count)}</Big>
            <Note>{t("newArtists.note", { songs: s.songs })}</Note>
          </>
        );
      case "discovery":
        return (
          <>
            <Title>{t("discovery.title")}</Title>
            <Artwork
              image={image(s.artist.image_id)}
              alt=""
              sizes="240px"
              className="replay__art replay__art--round"
            />
            <Big>
              <Link href={{ pathname: "/artists/[slug]", params: { slug: s.artist.slug } }}>
                {s.artist.name}
              </Link>
            </Big>
            <Note>{t("discovery.note", { time: formatListening(Number(s.artist.ms ?? 0)) })}</Note>
          </>
        );
      case "underground":
        return (
          <>
            <Title>{t("underground.title")}</Title>
            <Big>{n(s.count)}</Big>
            <Note>{t("underground.note")}</Note>
          </>
        );
      case "listening_time":
        return (
          <>
            <Title>{t("listeningTime.title")}</Title>
            <Big>{`${s.hour}:00`}</Big>
            <Note>
              {t("listeningTime.note", {
                share: format.number(s.nightShare, { style: "percent" }),
              })}
            </Note>
          </>
        );
      case "streak":
        return (
          <>
            <Title>{t("streak.title")}</Title>
            <Big>{t("streak.days", { count: s.days })}</Big>
            <Note>{t("streak.note")}</Note>
          </>
        );
      case "personality":
        return (
          <>
            <Title>{t("personality.title")}</Title>
            <Big>{t(`personality.types.${s.personality}`)}</Big>
          </>
        );
      case "score":
        return (
          <>
            <Title>{t("score.title")}</Title>
            <Big>{n(s.score)}</Big>
            <Note>{t("score.note")}</Note>
          </>
        );
      case "year_vs_year":
        return (
          <>
            <Title>{t("vs.title", { year: s.year })}</Title>
            <dl className="replay__vs">
              {(
                [
                  ["minutes", s.minutes],
                  ["newArtists", s.newArtists],
                  ["score", s.score],
                ] as const
              ).map(([key, [before, after]]) => (
                <div key={key}>
                  <dt>{t(`vs.${key}`)}</dt>
                  <dd>
                    {n(before)} → <strong>{n(after)}</strong> <small>{change(before, after)}</small>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        );
      case "outro":
        return (
          <>
            <Title>{t("outro.title", { year: s.year })}</Title>
            <Note>{t("outro.note")}</Note>
            <p className="replay__actions">
              <a
                className="button button--primary"
                href={`/api/cards/replay?year=${s.year}&format=story&locale=${locale}`}
                download={`tunewick-replay-${s.year}.png`}
              >
                {t("outro.story")}
              </a>
              <a
                className="button"
                href={`/api/cards/replay?year=${s.year}&format=square&locale=${locale}`}
                download={`tunewick-replay-${s.year}-square.png`}
              >
                {t("outro.square")}
              </a>
            </p>
          </>
        );
    }
  };

  return (
    <section className="stats replay-page">
      <header className="stats__head">
        <p className="stats__back">
          <Link href="/you">{t("back")}</Link>
        </p>
        <h1 className="stats__title">{t("heading", { year })}</h1>
        {years}
      </header>
      <ReplayPlayer
        screens={story.map(render)}
        labels={{
          previous: t("player.previous"),
          next: t("player.next"),
          pause: t("player.pause"),
          play: t("player.play"),
          screen: t("player.screen"),
        }}
      />
    </section>
  );
}
