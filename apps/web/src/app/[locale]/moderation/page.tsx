import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { isAdmin, requireStaff } from "@/modules/auth";
import {
  getSubmissions,
  getVerificationRequests,
  VerificationDecisionForm,
} from "@/modules/moderation";

export const metadata: Metadata = { robots: { index: false } };

/** Moderation queue: staff with MFA only (the database enforces the same rule). */
export default async function ModerationPage({ params }: PageProps<"/[locale]/moderation">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  await requireStaff("moderator", {
    signIn: getPathname({ href: { pathname: "/login", query: { next: "/moderation" } }, locale }),
    security: getPathname({ href: "/settings/security", locale }),
    forbidden: getPathname({ href: "/", locale }),
  });
  const t = await getTranslations("Moderation");
  const tReleases = await getTranslations("Releases");
  const format = await getFormatter();
  const [submissions, admin, verifications] = await Promise.all([
    getSubmissions(),
    isAdmin(),
    getVerificationRequests(),
  ]);
  const tPromo = await getTranslations("PromoAdmin");

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <h1 className="auth-page__title">{t("title")}</h1>
        <p className="auth-page__lead">{t("lead")}</p>
        {admin ? (
          <p className="settings-profile-link">
            <Link href="/admin/promo">{tPromo("link")}</Link>
          </p>
        ) : null}
      </div>
      <div className="auth-page__body">
        {submissions.length === 0 ? (
          <p className="field__hint">{t("empty")}</p>
        ) : (
          <ul className="artist-list">
            {submissions.map((s) => (
              <li key={s.id} className="artist-list__item">
                <Link
                  className="artist-list__name"
                  href={{ pathname: "/moderation/[release]", params: { release: s.id } }}
                >
                  {s.artist?.name} — {s.title}
                </Link>
                <span className="field__hint">
                  {tReleases(`types.${s.type}`)} ·{" "}
                  {t("trackCount", { count: s.tracks[0]?.count ?? 0 })}
                  {s.submitted_at
                    ? ` · ${t("submitted", {
                        date: format.dateTime(new Date(s.submitted_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <section className="settings-form__group" aria-labelledby="verifications">
          <h2 id="verifications" className="section-title">
            {t("verification.title", { count: verifications.length })}
          </h2>
          {verifications.length === 0 ? (
            <p className="field__hint">{t("verification.empty")}</p>
          ) : (
            <ul className="promo-codes">
              {verifications.map((v) => (
                <li key={v.id} className="promo-codes__item">
                  <Link
                    className="artist-list__name"
                    href={{ pathname: "/artists/[slug]", params: { slug: v.artist.slug } }}
                  >
                    {v.artist.name}
                  </Link>
                  <span className="field__hint">
                    {t("submitted", {
                      date: format.dateTime(new Date(v.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </span>
                  <ul className="verification-evidence">
                    {v.evidence.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer nofollow">
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {v.note ? <p className="profile__bio">{v.note}</p> : null}
                  <VerificationDecisionForm requestId={v.id} artistName={v.artist.name} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
