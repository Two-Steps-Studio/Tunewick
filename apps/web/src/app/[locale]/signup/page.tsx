import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthPage, getOptionalUser, SignUpForm } from "@/modules/auth";
import { isFeatureEnabled } from "@/modules/flags";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/signup">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Auth.signup" });
  return { title: t("title") };
}

export default async function SignUpPage({ params }: PageProps<"/[locale]/signup">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (await getOptionalUser()) redirect({ href: "/", locale: locale as Locale });
  const t = await getTranslations("Auth.signup");

  return (
    <AuthPage
      title={t("title")}
      lead={t("lead")}
      footer={
        <p>
          {t("haveAccount")} <Link href="/login">{t("toLogin")}</Link>
        </p>
      }
    >
      <SignUpForm inviteRequired={await isFeatureEnabled("closed_beta")} />
    </AuthPage>
  );
}
