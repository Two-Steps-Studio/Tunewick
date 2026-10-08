import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import {
  getCountryOptions,
  getDiscoveryPreferences,
  getGenres,
  Onboarding,
} from "@/modules/discover";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/welcome">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Onboarding" });
  return { title: t("title") };
}

/** Discovery preferences: the onboarding choices, editable any time. */
export default async function WelcomePage({ params }: PageProps<"/[locale]/welcome">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Onboarding");
  const [{ preferences, signedIn }, genres, countries] = await Promise.all([
    getDiscoveryPreferences(),
    getGenres(locale),
    getCountryOptions(locale),
  ]);
  return (
    <section className="welcome">
      <h1 className="welcome__title">{t("title")}</h1>
      <p className="welcome__lead">{t("lead")}</p>
      <Onboarding genres={genres} countries={countries} initial={preferences} signedIn={signedIn} />
    </section>
  );
}
