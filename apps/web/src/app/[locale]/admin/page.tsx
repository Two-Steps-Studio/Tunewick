import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SCHEMA_VERSION } from "@/lib/schema-version";
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
  const { media, errors, funnel, active, databaseBehind, staff, flags, audit, playback, shares } =
    await getAdminOverview(filter);
  const storageDenied = media?.recent_errors.some((e) =>
    /AccessDenied|NoSuchBucket|403/.test(e.message),
  );
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
          {" · "}
          <Link href="/admin/ads">{t("toAds")}</Link>
        </p>
      </div>
      <div className="auth-page__body">
        {databaseBehind ? (
          <p className="form-error" role="alert">
            {t("databaseBehind", { version: SCHEMA_VERSION })}
          </p>
        ) : null}
        {media ? (
          <section className="settings-form__group" aria-labelledby="media">
            <h2 id="media" className="section-title">
              {t("media.title")}
            </h2>
            <p className="field__hint">{t("media.lead")}</p>
            <ul className="readiness">
              {(["audio", "images"] as const).map((kind) => (
                <li
                  key={kind}
                  className={media[kind].waiting === 0 ? "readiness__done" : "readiness__todo"}
                >
                  {t(`media.${kind}`, {
                    waiting: media[kind].waiting,
                    processing: media[kind].processing,
                  })}
                  {media[kind].oldest_waiting_at
                    ? ` ${t("media.oldest", {
                        when: format.relativeTime(new Date(media[kind].oldest_waiting_at!)),
                      })}`
                    : ""}
                </li>
              ))}
            </ul>
            {media.stuck ? <p className="form-error">{t("media.stuck")}</p> : null}
            {storageDenied ? <p className="form-error">{t("media.denied")}</p> : null}
            <p className="field__hint">{t("media.errors24h", { count: media.errors_24h })}</p>
            {media.recent_errors.length ? (
              <ul className="artist-list">
                {media.recent_errors.map((e) => (
                  <li key={e.at} className="artist-list__item">
                    <span className="artist-list__name">
                      {t(`media.kinds.${e.kind}`)} ·{" "}
                      {format.dateTime(new Date(e.at), { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <code className="field__hint media-error">{e.message}</code>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {funnel && active ? (
          <section className="settings-form__group" aria-labelledby="growth">
            <h2 id="growth" className="section-title">
              {t("growth.title")}
            </h2>
            <dl className="stat-tiles">
              {(
                [
                  ["today", active.today],
                  ["week", active.last_7_days],
                  ["month", active.last_30_days],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="stat-tile">
                  <dt>{t(`growth.active.${key}`)}</dt>
                  <dd>{format.number(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="field__hint">{t("growth.funnelLead")}</p>
            <ol className="funnel">
              {funnel.map((row) => {
                const base = funnel[0]?.accounts ?? 0;
                const share = base ? row.accounts / base : 0;
                return (
                  <li key={row.step} className="funnel__step">
                    <span className="funnel__label">
                      {t(`growth.steps.${row.step as "signed_up"}`)}
                    </span>
                    <span className="funnel__bar" aria-hidden="true">
                      <span style={{ width: `${Math.round(share * 100)}%` }} />
                    </span>
                    <span className="funnel__value">
                      {format.number(row.accounts)}
                      {base ? ` · ${format.number(share, { style: "percent" })}` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        {errors ? (
          <section className="settings-form__group" aria-labelledby="app-errors">
            <h2 id="app-errors" className="section-title">
              {t("appErrors.title")}
            </h2>
            <p className="field__hint">{t("appErrors.lead")}</p>
            {errors.length === 0 ? (
              <p className="field__hint">{t("appErrors.empty")}</p>
            ) : (
              <ul className="artist-list">
                {errors.map((e) => (
                  <li key={`${e.source}:${e.message}:${e.last_seen}`} className="artist-list__item">
                    <span className="artist-list__name">{e.message}</span>
                    <span className="field__hint">
                      {t(`appErrors.${e.source === "server" ? "server" : "client"}`)} ·{" "}
                      {t("appErrors.times", { count: Number(e.occurrences) })} ·{" "}
                      {format.relativeTime(new Date(e.last_seen))}
                      {e.path ? ` · ${e.path}` : ""}
                    </span>
                    {e.detail ? (
                      <details>
                        <summary className="field__hint">{t("appErrors.details")}</summary>
                        <pre className="field__hint media-error">{e.detail}</pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

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

        <section className="settings-form__group" aria-labelledby="playback">
          <h2 id="playback" className="section-title">
            {t("playback")}
          </h2>
          <p className="field__hint">{t("playbackLead")}</p>
          {playback.length === 0 ? (
            <p className="field__hint">{t("playbackEmpty")}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("playbackTier")}</th>
                  <th scope="col">{t("playbackStarts")}</th>
                  <th scope="col">{t("playbackP50")}</th>
                  <th scope="col">{t("playbackP90")}</th>
                  <th scope="col">{t("playbackErrors")}</th>
                </tr>
              </thead>
              <tbody>
                {playback.map((row) => (
                  <tr key={row.tier ?? "none"}>
                    <th scope="row">{row.tier ?? "-"}</th>
                    <td>{row.starts}</td>
                    <td className={row.first_audio_p50_ms > 1000 ? "admin-table__over" : undefined}>
                      {row.first_audio_p50_ms === null ? "-" : `${row.first_audio_p50_ms} ms`}
                    </td>
                    <td>
                      {row.first_audio_p90_ms === null ? "-" : `${row.first_audio_p90_ms} ms`}
                    </td>
                    <td>
                      {row.errors}
                      {row.top_error ? ` (${row.top_error})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="settings-form__group" aria-labelledby="shares">
          <h2 id="shares" className="section-title">
            {t("shares", {
              month: format.dateTime(new Date(`${shares.month}T12:00:00Z`), {
                month: "long",
                year: "numeric",
              }),
            })}
          </h2>
          <p className="field__hint">{t("sharesLead")}</p>
          {shares.rows.length === 0 ? (
            <p className="field__hint">{t("sharesEmpty")}</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t("sharesArtist")}</th>
                  <th scope="col">{t("sharesListeners")}</th>
                  <th scope="col">{t("sharesPlays")}</th>
                  <th scope="col">{t("sharesHours")}</th>
                </tr>
              </thead>
              <tbody>
                {shares.rows.map((row) => (
                  <tr key={row.artist_id}>
                    <th scope="row">
                      <Link
                        href={{ pathname: "/artists/[slug]", params: { slug: row.artist_slug } }}
                      >
                        {row.artist_name}
                      </Link>
                    </th>
                    <td>{row.listeners}</td>
                    <td>{row.qualified_plays}</td>
                    <td>{row.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="settings-form__group" aria-labelledby="audit">
          <h2 id="audit" className="section-title">
            {t("audit")}
          </h2>
          <nav aria-label={t("auditFilter")} className="region-filter region-filter--wrap">
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
