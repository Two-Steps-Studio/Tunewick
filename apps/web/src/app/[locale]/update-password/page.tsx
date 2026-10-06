import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthPage, getOptionalUser, UpdatePasswordForm } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/update-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Auth.update" });
  return { title: t("title"), robots: { index: false } };
}

export default async function UpdatePasswordPage({
  params,
}: PageProps<"/[locale]/update-password">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Auth.update");
  // Reached through the recovery email link, which signs the user in for this purpose.
  const user = await getOptionalUser();

  return (
    <AuthPage title={t("title")} lead={user ? t("lead") : t("expired")}>
      {user ? <UpdatePasswordForm /> : <Link href="/reset-password">{t("requestNew")}</Link>}
    </AuthPage>
  );
}
