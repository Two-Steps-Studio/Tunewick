import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  AuthPage,
  getMfaStatus,
  MfaVerifyForm,
  PasskeyVerify,
  requireUser,
  safeNextPath,
} from "@/modules/auth";

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
  const t = await getTranslations("Security");
  const target = typeof next === "string" ? safeNextPath(next) : null;
  const several = mfa.passkeys.length > 1;
  return (
    <AuthPage title={t("verify.title")} lead={t("verify.lead")}>
      {mfa.passkeys.map((passkey) => (
        <PasskeyVerify
          key={passkey.id}
          factorId={passkey.id}
          label={several ? (passkey.name ?? undefined) : undefined}
          next={target ?? getPathname({ href: "/", locale })}
        />
      ))}
      {mfa.passkeys.length && mfa.totp ? <p className="field__hint">{t("or")}</p> : null}
      {mfa.totp ? <MfaVerifyForm next={typeof next === "string" ? next : undefined} /> : null}
    </AuthPage>
  );
}
