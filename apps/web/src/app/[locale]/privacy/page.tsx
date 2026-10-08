import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LegalPage, legalMeta } from "@/modules/legal";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  return legalMeta((await params).locale, "privacy");
}

export default async function Page({ params }: PageProps<"/[locale]/privacy">) {
  setRequestLocale((await params).locale as Locale);
  return <LegalPage document="privacy" />;
}
