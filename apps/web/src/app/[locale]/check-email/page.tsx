import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthPage } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/check-email">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Auth.checkEmail" });
  return { title: t("title"), robots: { index: false } };
}

export default async function CheckEmailPage({
  params,
  searchParams,
}: PageProps<"/[locale]/check-email">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { reason } = await searchParams;
  const t = await getTranslations("Auth.checkEmail");
  return (
    <AuthPage
      title={t("title")}
      lead={reason === "reset" ? t("reset") : t("signup")}
      footer={<Link href="/login">{t("back")}</Link>}
    >
      {null}
    </AuthPage>
  );
}
