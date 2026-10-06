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
import {
  AppealDecisionForm,
  getOpenReports,
  getPendingAppeals,
  ModerateReportForm,
} from "@/modules/reports";

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
  const [submissions, admin, verifications, reports, appeals] = await Promise.all([
    getSubmissions(),
    isAdmin(),
    getVerificationRequests(),
    getOpenReports(),
    getPendingAppeals(),
  ]);
  const tReports = await getTranslations("Reports");
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
        <section className="settings-form__group" aria-labelledby="reports">
          <h2 id="reports" className="section-title">
            {tReports("queue.title", { count: reports.length })}
          </h2>
          {reports.length === 0 ? (
            <p className="field__hint">{tReports("queue.empty")}</p>
          ) : (
            <ul className="promo-codes">
              {reports.map((item) => (
                <li key={item.report.id} className="promo-codes__item report-item">
                  {item.subject?.releaseSlug && item.subject.artistSlug ? (
                    <Link
                      className="artist-list__name"
                      href={{
                        pathname: "/artists/[slug]/releases/[release]",
                        params: {
                          slug: item.subject.artistSlug,
                          release: item.subject.releaseSlug,
                        },
                      }}
                    >
                      {item.subject.title}
                    </Link>
                  ) : item.subject?.artistSlug ? (
                    <Link
                      className="artist-list__name"
                      href={{
                        pathname: "/artists/[slug]",
                        params: { slug: item.subject.artistSlug },
                      }}
                    >
                      {item.subject.title}
                    </Link>
                  ) : (
                    <span className="artist-list__name">{item.subject?.title ?? "—"}</span>
                  )}
                  <span className="field__hint">
                    {tReports(`subjects.${item.report.subject_type}`)} ·{" "}
                    {tReports("queue.count", { count: item.reports.length })}
                    {item.strikes ? ` · ${tReports("queue.strikes", { count: item.strikes })}` : ""}
                  </span>
                  <ul className="report-item__reports">
                    {item.reports.map((r) => (
                      <li key={r.id}>
                        <strong>{tReports(`reasons.${r.reason}`)}</strong>: {r.details}
                        {r.claimant_name ? (
                          <span className="field__hint">
                            {" "}
                            ·{" "}
                            {tReports("queue.claimant", {
                              name: r.claimant_name,
                              email: r.claimant_email ?? "",
                            })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <ModerateReportForm
                    reportId={item.report.id}
                    subjectType={item.report.subject_type}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="settings-form__group" aria-labelledby="appeals">
          <h2 id="appeals" className="section-title">
            {tReports("appeals.title", { count: appeals.length })}
          </h2>
          {appeals.length === 0 ? (
            <p className="field__hint">{tReports("appeals.empty")}</p>
          ) : (
            <ul className="promo-codes">
              {appeals.map((item) => (
                <li key={item.id} className="promo-codes__item">
                  {item.subject?.releaseSlug && item.subject.artistSlug ? (
                    <Link
                      className="artist-list__name"
                      href={{
                        pathname: "/artists/[slug]/releases/[release]",
                        params: {
                          slug: item.subject.artistSlug,
                          release: item.subject.releaseSlug,
                        },
                      }}
                    >
                      {item.subject.title}
                    </Link>
                  ) : item.subject?.artistSlug ? (
                    <Link
                      className="artist-list__name"
                      href={{
                        pathname: "/artists/[slug]",
                        params: { slug: item.subject.artistSlug },
                      }}
                    >
                      {item.subject.title}
                    </Link>
                  ) : (
                    <span className="artist-list__name">{item.subject?.title ?? "—"}</span>
                  )}
                  <span className="field__hint">
                    {tReports(`moderation.actions.${item.action as "takedown_release"}`)} ·{" "}
                    {tReports(`reasons.${item.reason}`)}
                  </span>
                  <p>
                    <strong>{tReports("appeals.statement")}</strong> {item.statement}
                  </p>
                  <p>
                    <strong>{tReports("appeals.appeal")}</strong> {item.appeal_text}
                  </p>
                  <AppealDecisionForm decisionId={item.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
