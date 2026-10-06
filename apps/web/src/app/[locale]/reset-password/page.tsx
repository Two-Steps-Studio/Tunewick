import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthPage, ResetRequestForm } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Auth.reset" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Auth.reset");
  return (
    <AuthPage title={t("title")} lead={t("lead")} footer={<Link href="/login">{t("back")}</Link>}>
      <ResetRequestForm />
    </AuthPage>
  );
}
