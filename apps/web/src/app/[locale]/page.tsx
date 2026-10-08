import { randomInt } from "node:crypto";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isJourney } from "@tunewick/shared";
import type { Locale } from "@/i18n/routing";
import {
  DiscoverFeed,
  getCountryOptions,
  getDiscoveryPreferences,
  getFeedPage,
  getGenres,
  Onboarding,
} from "@/modules/discover";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Feed" });
  return { title: t("title"), description: t("description") };
}

const CODE = /^[a-z2-9]{10}$/;
const SLUG = /^[a-z0-9-]{2,60}$/;

/**
 * Discover — the center of Tunewick: a feed of previews, one song at a time, each with the reason
 * it is here. First visit: one short screen of choices (or skip) so the first feed already fits.
 */
export default async function DiscoverPage({ params, searchParams }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const query = await searchParams;
  const start = typeof query.start === "string" && CODE.test(query.start) ? query.start : undefined;
  const artist =
    typeof query.artist === "string" && SLUG.test(query.artist) ? query.artist : undefined;
  const journey = isJourney(query.journey) ? query.journey : undefined;
  const similar =
    typeof query.similar === "string" && CODE.test(query.similar) ? query.similar : undefined;
  const set = query.set === "daily" || query.set === "weekly" ? query.set : undefined;
  const { preferences, signedIn } = await getDiscoveryPreferences();
  // After deleting an account (privacy flow) the person lands here; say it was done.
  const tFeed = await getTranslations("Feed");
  const deleted =
    query.konto === "usuniete" ? (
      <p role="status" className="form-status feed-status">
        {tFeed("accountDeleted")}
      </p>
    ) : null;

  if (!preferences.onboarded && !start && !artist && !journey && !similar && !set) {
    const t = await getTranslations("Onboarding");
    const [genres, countries] = await Promise.all([getGenres(locale), getCountryOptions(locale)]);
    return (
      <section className="welcome">
        {deleted}
        <h1 className="welcome__title">{tFeed("title")}</h1>
        <p className="welcome__lead">{t("lead")}</p>
        <h2 className="welcome__question">{t("question")}</h2>
        <Onboarding
          genres={genres}
          countries={countries}
          initial={preferences}
          signedIn={signedIn}
        />
      </section>
    );
  }

  const page = await getFeedPage({
    seed: randomInt(2 ** 30),
    startCode: start,
    artistSlug: artist,
    journey,
    similarCode: similar,
    set,
    locale,
  });
  return (
    <>
      {deleted}
      <DiscoverFeed initial={page} />
    </>
  );
}
