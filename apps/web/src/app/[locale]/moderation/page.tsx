import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { isAdmin, requireStaff } from "@/modules/auth";
import { decideReport, getOpenReports, getSubmissions } from "@/modules/moderation";

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
  const [submissions, admin, reports] = await Promise.all([
    getSubmissions(),
    isAdmin(),
    getOpenReports(),
  ]);
  const tReport = await getTranslations("Report");
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

        <section aria-labelledby="reports" className="settings-form__group">
          <h2 id="reports" className="section-title">
            {t("reports.title", { count: reports.length })}
          </h2>
          {reports.length === 0 ? (
            <p className="field__hint">{t("reports.empty")}</p>
          ) : (
            <ul className="artist-list">
              {reports.map((r) => (
                <li key={r.id} className="artist-list__item report-item">
                  <span className="artist-list__name">
                    {r.artistSlug && r.releaseSlug ? (
                      <Link
                        href={{
                          pathname: "/artists/[slug]/releases/[release]",
                          params: { slug: r.artistSlug, release: r.releaseSlug },
                        }}
                      >
                        {r.label ?? t("reports.gone")}
                      </Link>
                    ) : r.artistSlug ? (
                      <Link href={{ pathname: "/artists/[slug]", params: { slug: r.artistSlug } }}>
                        {r.label ?? t("reports.gone")}
                      </Link>
                    ) : r.handle ? (
                      <Link href={{ pathname: "/profile/[handle]", params: { handle: r.handle } }}>
                        {r.label}
                      </Link>
                    ) : (
                      (r.label ?? t("reports.gone"))
                    )}
                  </span>
                  <span className="field__hint">
                    {t(`reports.subjects.${r.subject_type as "track"}`)} ·{" "}
                    {tReport(`categories.${r.category as "copyright"}`)} ·{" "}
                    {format.dateTime(new Date(r.created_at), { dateStyle: "medium" })}
                  </span>
                  {r.details ? <p className="report-item__details">{r.details}</p> : null}
                  <div className="decision-form__buttons">
                    <form action={decideReport.bind(null, r.id, "actioned")}>
                      <button type="submit" className="button button--primary">
                        {t("reports.actioned")}
                      </button>
                    </form>
                    <form action={decideReport.bind(null, r.id, "dismissed")}>
                      <button type="submit" className="button">
                        {t("reports.dismissed")}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="field__hint">{t("reports.hint")}</p>
        </section>
      </div>
    </section>
  );
}
