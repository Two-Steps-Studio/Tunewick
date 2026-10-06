import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthPage, getMfaStatus, requireUser, TotpDisable, TotpEnrollment } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/settings/security">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Security" });
  return { title: t("title"), robots: { index: false } };
}

export default async function SecurityPage({ params }: PageProps<"/[locale]/settings/security">) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const here = getPathname({ href: "/settings/security", locale });
  await requireUser(getPathname({ href: { pathname: "/login", query: { next: here } }, locale }));
  const mfa = await getMfaStatus();
  const t = await getTranslations("Security");

  return (
    <AuthPage title={t("title")} lead={t("lead")}>
      <div className="mfa-status">
        <p role="status" className={mfa.enabled ? "mfa-status__on" : "mfa-status__off"}>
          {mfa.enabled ? t("statusOn") : t("statusOff")}
        </p>
        <p className="field__hint">{t("staffNote")}</p>
      </div>
      {mfa.enabled ? (
        mfa.verified ? (
          <TotpDisable />
        ) : (
          <p>{t("disableNeedsVerify")}</p>
        )
      ) : (
        <TotpEnrollment />
      )}
    </AuthPage>
  );
}
