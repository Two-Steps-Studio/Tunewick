import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthPage, getMfaStatus, MfaVerifyForm, requireUser } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/verify">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Security.verify" });
  return { title: t("title"), robots: { index: false } };
}

/** Second sign-in step for accounts with a verified authenticator app. */
export default async function VerifyPage({ params, searchParams }: PageProps<"/[locale]/verify">) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  await requireUser(getPathname({ href: "/login", locale }));
  const mfa = await getMfaStatus();
  if (!mfa.enabled || mfa.verified) redirect({ href: "/", locale });

  const { next } = await searchParams;
  const t = await getTranslations("Security.verify");
  return (
    <AuthPage title={t("title")} lead={t("lead")}>
      <MfaVerifyForm next={typeof next === "string" ? next : undefined} />
    </AuthPage>
  );
}
