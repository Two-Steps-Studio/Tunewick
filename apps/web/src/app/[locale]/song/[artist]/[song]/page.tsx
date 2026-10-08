import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { countryName, flagEmoji, songSegment } from "@/lib/intl";
import { slugify } from "@/lib/slug";
import { getSharedSong, parseSongSegment, ShareButton, SongPreview } from "@/modules/discover";
import { Artwork } from "@/modules/images";

type Params = PageProps<"/[locale]/song/[artist]/[song]">["params"];

async function load(params: Params) {
  const { song } = await params;
  const code = parseSongSegment(song);
  return code ? getSharedSong(code) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const data = await load(params);
  if (!data) return {};
  const t = await getTranslations({ locale: locale as Locale, namespace: "Song" });
  const title = `${data.track.title} — ${data.artist.name}`;
  const description = t("metaDescription", { title: data.track.title, artist: data.artist.name });
  return {
    title,
    description,
    openGraph: { title, description, type: "music.song" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * A shared song: artwork, artist, the preview — no account needed — and a way into Discover.
 * The title part of the URL is cosmetic; the code decides, and old titles redirect.
 */
export default async function SongPage({ params }: PageProps<"/[locale]/song/[artist]/[song]">) {
  const { locale, artist: artistParam, song } = await params;
  setRequestLocale(locale as Locale);
  const data = await load(params);
  if (!data) notFound();

  const canonical = songSegment(data.track.title, data.track.code, slugify);
  if (
    decodeURIComponent(song) !== canonical ||
    decodeURIComponent(artistParam) !== data.artist.slug
  ) {
    permanentRedirect(
      getPathname({
        href: {
          pathname: "/song/[artist]/[song]",
          params: { artist: data.artist.slug, song: canonical },
        },
        locale: locale as Locale,
      }),
    );
  }

  const t = await getTranslations("Song");
  const place = [
    data.artist.city,
    data.artist.countryCode ? countryName(data.artist.countryCode, locale) : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <article className="song-page">
      <Artwork
        image={data.cover}
        alt={t("coverAlt", { title: data.track.title, artist: data.artist.name })}
        sizes="(min-width: 768px) 24rem, 100vw"
        className="song-page__cover"
        priority
      />
      <div className="song-page__info">
        <p className="artist-badge">{t("badge")}</p>
        <h1 className="song-page__title">{data.track.title}</h1>
        <p className="song-page__artist">
          <Link href={{ pathname: "/artists/[slug]", params: { slug: data.artist.slug } }}>
            {data.artist.name}
          </Link>
        </p>
        {place ? (
          <p className="song-page__place">
            {data.artist.countryCode ? (
              <span aria-hidden="true">{flagEmoji(data.artist.countryCode)} </span>
            ) : null}
            {place}
          </p>
        ) : null}
        <SongPreview
          item={{
            trackId: data.track.id,
            code: data.track.code,
            title: data.track.title,
            durationMs: null,
            explicit: data.track.explicit,
            artist: data.artist,
            release: data.release,
            countryCode: data.artist.countryCode,
            city: data.artist.city,
            genres: [],
            cover: data.cover,
            preview: data.preview,
            reason: { code: "shared" },
            exploration: false,
            liked: null,
            saved: null,
            following: null,
          }}
        />
        <div className="song-page__actions">
          <Link
            href={{ pathname: "/", query: { start: data.track.code } }}
            className="button button--primary"
          >
            {t("discoverMore")}
          </Link>
          <Link
            href={{
              pathname: "/artists/[slug]/releases/[release]",
              params: { slug: data.artist.slug, release: data.release.slug },
            }}
            className="button"
          >
            {t("fullRelease", { title: data.release.title })}
          </Link>
          <ShareButton
            variant="button"
            song={{
              trackId: data.track.id,
              code: data.track.code,
              title: data.track.title,
              artistName: data.artist.name,
              artistSlug: data.artist.slug,
            }}
          />
        </div>
        <p className="song-page__pitch">{t("pitch")}</p>
      </div>
    </article>
  );
}
