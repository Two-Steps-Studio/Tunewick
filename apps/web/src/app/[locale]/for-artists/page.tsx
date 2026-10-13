import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { alternates } from "@/lib/site";
import { getOptionalUser } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/for-artists">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "ForArtists" });
  return {
    title: t("title"),
    description: t("lead"),
    alternates: alternates("/for-artists", locale as Locale),
    openGraph: { title: t("title"), description: t("lead") },
  };
}

const REASONS = ["rights", "quality", "fair", "discovery", "stats", "share"] as const;
const STEPS = ["profile", "upload", "found"] as const;
const QUESTIONS = ["cost", "rights", "formats", "withdraw", "where"] as const;

/** Why and how to put your music on Tunewick - every claim backed by how the service works. */
export default async function ForArtistsPage({ params }: PageProps<"/[locale]/for-artists">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, user] = await Promise.all([getTranslations("ForArtists"), getOptionalUser()]);
  const cta = user ? (
    <Link href="/artists/new" className="button button--primary">
      {t("ctaCreate")}
    </Link>
  ) : (
    <Link href="/signup" className="button button--primary">
      {t("ctaSignUp")}
    </Link>
  );

  return (
    <article className="for-artists">
      <header className="for-artists__hero">
        <p className="for-artists__eyebrow">{t("eyebrow")}</p>
        <h1 className="for-artists__title">{t("title")}</h1>
        <p className="for-artists__lead">{t("lead")}</p>
        <p className="for-artists__actions">
          {cta}
          <Link href="/artist-terms" className="button">
            {t("terms")}
          </Link>
        </p>
      </header>

      <section aria-labelledby="why" className="for-artists__section">
        <h2 id="why" className="section-title">
          {t("why")}
        </h2>
        <ul className="for-artists__grid">
          {REASONS.map((key) => (
            <li key={key} className="for-artists__card">
              <h3>{t(`reasons.${key}.title`)}</h3>
              <p>{t(`reasons.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how" className="for-artists__section">
        <h2 id="how" className="section-title">
          {t("how")}
        </h2>
        <ol className="for-artists__steps">
          {STEPS.map((key) => (
            <li key={key}>
              <h3>{t(`steps.${key}.title`)}</h3>
              <p>{t(`steps.${key}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="faq" className="for-artists__section">
        <h2 id="faq" className="section-title">
          {t("faq")}
        </h2>
        <div className="for-artists__faq">
          {QUESTIONS.map((key) => (
            <details key={key}>
              <summary>{t(`questions.${key}.q`)}</summary>
              <p>{t(`questions.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="for-artists__actions">{cta}</p>
    </article>
  );
}
