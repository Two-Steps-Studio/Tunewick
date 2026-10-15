import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { songSegment } from "@/lib/intl";
import { absoluteUrl } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { routing, type Locale } from "@/i18n/routing";
import { getSharedSong, SongPreview } from "@/modules/discover";

/**
 * The embed player (an iframe on artists' sites, blogs, articles): cover, title, artist, the
 * song's preview and a link to the full song on Tunewick. Language from ?lang (default Polish).
 */
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { code } = await params;
  const { lang } = await searchParams;
  const locale: Locale = (routing.locales as readonly string[]).includes(lang ?? "")
    ? (lang as Locale)
    : routing.defaultLocale;
  if (!/^[a-z2-9]{10}$/.test(code)) notFound();
  const data = await getSharedSong(code, 320);
  if (!data) notFound();
  const [t, messages] = await Promise.all([
    getTranslations({ locale, namespace: "Embed" }),
    getMessages({ locale }),
  ]);
  const href = absoluteUrl(
    {
      pathname: "/song/[artist]/[song]",
      params: {
        artist: data.artist.slug,
        song: songSegment(data.track.title, data.track.code, slugify),
      },
    },
    locale,
  );
  return (
    <NextIntlClientProvider locale={locale} messages={{ Feed: messages.Feed }}>
      <main className="embed">
        <a className="embed__art" href={href} target="_blank" rel="noopener">
          {data.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP variant
            <img src={data.cover.src} alt="" width={120} height={120} />
          ) : (
            <span aria-hidden="true" />
          )}
        </a>
        <div className="embed__body">
          <div className="embed__title">
            <a href={href} target="_blank" rel="noopener">
              {data.track.title}
            </a>
          </div>
          <div className="embed__artist">{data.artist.name}</div>
          <SongPreview
            item={{
              trackId: data.track.id,
              code: data.track.code,
              title: data.track.title,
              durationMs: null,
              explicit: data.track.explicit,
              why: [],
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
          <a className="embed__brand" href={href} target="_blank" rel="noopener">
            {t("listenOn")}
          </a>
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
