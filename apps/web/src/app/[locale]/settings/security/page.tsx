import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  AuthPage,
  getMfaStatus,
  PasskeyAdd,
  removePasskey,
  requireUser,
  TotpDisable,
  TotpEnrollment,
} from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/settings/security">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Security" });
  return { title: t("title"), robots: { index: false } };
}

/** Second factors: passkeys (no extra app) and/or an authenticator app. */
export default async function SecurityPage({ params }: PageProps<"/[locale]/settings/security">) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const here = getPathname({ href: "/settings/security", locale });
  await requireUser(getPathname({ href: { pathname: "/login", query: { next: here } }, locale }));
  const mfa = await getMfaStatus();
  const t = await getTranslations("Security");
  const format = await getFormatter();
  // With a factor already set up, changes need a session that passed it (Supabase Auth rule).
  const canChange = !mfa.enabled || mfa.verified;

  return (
    <AuthPage title={t("title")} lead={t("lead")}>
      <div className="mfa-status">
        <p role="status" className={mfa.enabled ? "mfa-status__on" : "mfa-status__off"}>
          {mfa.enabled ? t("statusOn") : t("statusOff")}
        </p>
        <p className="field__hint">{t("staffNote")}</p>
      </div>
      {canChange ? null : <p>{t("disableNeedsVerify")}</p>}

      <section className="settings-form__group" aria-labelledby="passkeys">
        <h2 id="passkeys" className="section-title">
          {t("passkey.title")}
        </h2>
        <p className="field__hint">{t("passkey.lead")}</p>
        {mfa.passkeys.length ? (
          <ul className="artist-list" aria-label={t("passkey.listTitle")}>
            {mfa.passkeys.map((passkey) => (
              <li key={passkey.id} className="artist-list__item">
                <span className="artist-list__name">{passkey.name ?? t("passkey.title")}</span>
                <span className="field__hint">
                  {t("passkey.added", {
                    date: format.dateTime(new Date(passkey.createdAt), { dateStyle: "medium" }),
                  })}
                </span>
                {mfa.verified ? (
                  <form action={removePasskey.bind(null, passkey.id)}>
                    <button type="submit" className="button button--quiet">
                      {t("passkey.remove")}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canChange ? <PasskeyAdd /> : null}
      </section>

      <section className="settings-form__group" aria-labelledby="totp">
        <h2 id="totp" className="section-title">
          {t("totpTitle")}
        </h2>
        {mfa.totp ? mfa.verified ? <TotpDisable /> : null : canChange ? <TotpEnrollment /> : null}
      </section>
    </AuthPage>
  );
}
