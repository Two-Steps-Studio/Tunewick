import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthPage, getOptionalUser, SignInForm } from "@/modules/auth";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Auth.login" });
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  if (await getOptionalUser()) redirect({ href: "/", locale: locale as Locale });

  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : undefined;
  const initialError = query.error === "linkInvalid" ? "linkInvalid" : undefined;
  const t = await getTranslations("Auth.login");

  return (
    <AuthPage
      title={t("title")}
      lead={t("lead")}
      footer={
        <>
          <Link href="/reset-password">{t("forgot")}</Link>
          <p>
            {t("noAccount")} <Link href="/signup">{t("toSignup")}</Link>
          </p>
        </>
      }
    >
      <SignInForm next={next} initialError={initialError} />
    </AuthPage>
  );
}
