import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  AUDIT_FILTERS,
  type AuditFilter,
  GrantPremiumForm,
  GrantRoleForm,
  getAdminOverview,
  revokeStaffRole,
  setFeatureFlag,
} from "@/modules/admin";
import { requireStaff } from "@/modules/auth";

export const metadata: Metadata = { robots: { index: false } };

/** Administration: staff roles, Premium for support, feature flags, audit log (admin + MFA). */
export default async function AdminPage({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const user = await requireStaff("admin", {
    signIn: getPathname({
      href: { pathname: "/login", query: { next: getPathname({ href: "/admin", locale }) } },
      locale,
    }),
    security: getPathname({ href: "/settings/security", locale }),
    forbidden: getPathname({ href: "/", locale }),
  });
  const filterParam = (await searchParams).dziennik;
  const filter = AUDIT_FILTERS.includes(filterParam as AuditFilter)
    ? (filterParam as AuditFilter)
    : null;
  const { staff, flags, audit } = await getAdminOverview(filter);
  const t = await getTranslations("Admin");
  const format = await getFormatter();

  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <h1 className="auth-page__title">{t("title")}</h1>
        <p className="auth-page__lead">{t("lead")}</p>
        <p className="settings-profile-link">
          <Link href="/moderation">{t("toModeration")}</Link> ·{" "}
          <Link href="/admin/promo">{t("toPromo")}</Link>
        </p>
      </div>
      <div className="auth-page__body">
        <section className="settings-form__group" aria-labelledby="staff">
          <h2 id="staff" className="section-title">
            {t("staff")}
          </h2>
          <ul className="promo-codes">
            {staff.map((s) => (
              <li key={`${s.user_id}:${s.role}`} className="promo-codes__item admin-staff">
                <span>
                  {s.handle ? `@${s.handle}` : (s.display_name ?? s.user_id.slice(0, 8))} ·{" "}
                  {t(`roles.${s.role}`)}
                </span>
                {s.user_id === user.id && s.role === "admin" ? (
                  <span className="field__hint">{t("you")}</span>
                ) : (
                  <form action={revokeStaffRole.bind(null, s.user_id, s.role)}>
                    <button
                      type="submit"
                      className="button button--quiet"
                      aria-label={t("revokeLabel", {
                        role: t(`roles.${s.role}`),
                        who: s.handle ?? s.user_id.slice(0, 8),
                      })}
                    >
                      {t("revoke")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <GrantRoleForm />
        </section>

        <section className="settings-form__group" aria-labelledby="premium">
          <h2 id="premium" className="section-title">
            {t("premium")}
          </h2>
          <p className="field__hint">{t("premiumLead")}</p>
          <GrantPremiumForm />
        </section>

        <section className="settings-form__group" aria-labelledby="flags">
          <h2 id="flags" className="section-title">
            {t("flags")}
          </h2>
          <ul className="promo-codes">
            {flags.map((f) => (
              <li key={f.key} className="promo-codes__item">
                <span>
                  <code>{f.key}</code> · {f.enabled ? t("on") : t("off")}
                </span>
                {f.description ? <span className="field__hint">{f.description}</span> : null}
                <form action={setFeatureFlag.bind(null, f.key, !f.enabled)}>
                  <button
                    type="submit"
                    className="button button--quiet"
                    aria-label={`${f.enabled ? t("turnOff") : t("turnOn")}: ${f.key}`}
                  >
                    {f.enabled ? t("turnOff") : t("turnOn")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section className="settings-form__group" aria-labelledby="audit">
          <h2 id="audit" className="section-title">
            {t("audit")}
          </h2>
          <nav aria-label={t("auditFilter")} className="region-filter">
            <Link
              href="/admin"
              className="region-filter__chip"
              aria-current={filter === null ? "page" : undefined}
            >
              {t("auditAll")}
            </Link>
            {AUDIT_FILTERS.map((f) => (
              <Link
                key={f}
                href={{ pathname: "/admin", query: { dziennik: f } }}
                className="region-filter__chip"
                aria-current={filter === f ? "page" : undefined}
              >
                {f.replace(/\.$/, "")}
              </Link>
            ))}
          </nav>
          <ol className="audit-log">
            {audit.map((entry) => (
              <li key={entry.id} className="audit-log__entry">
                <span className="audit-log__when">
                  {format.dateTime(new Date(entry.created_at), {
                    dateStyle: "short",
                    timeStyle: "medium",
                    timeZone: "Europe/Warsaw",
                  })}
                </span>
                <span>
                  <code>{entry.action}</code> ·{" "}
                  {entry.actor_kind === "system"
                    ? t("system")
                    : entry.actor_handle
                      ? `@${entry.actor_handle}`
                      : t("unknownActor")}{" "}
                  → {entry.subject_type} {entry.subject_id?.slice(0, 8)}
                </span>
                {entry.after || entry.before ? (
                  <code className="audit-log__data">
                    {JSON.stringify(entry.after ?? entry.before)}
                  </code>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
