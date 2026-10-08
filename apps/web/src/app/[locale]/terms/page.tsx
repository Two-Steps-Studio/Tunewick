import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LegalPage, legalMeta } from "@/modules/legal";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/terms">): Promise<Metadata> {
  return legalMeta((await params).locale, "terms");
}

export default async function Page({ params }: PageProps<"/[locale]/terms">) {
  setRequestLocale((await params).locale as Locale);
  return <LegalPage document="terms" />;
}
