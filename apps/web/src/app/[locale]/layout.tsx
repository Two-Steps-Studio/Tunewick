import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/site";
import { Bricolage_Grotesque, Instrument_Sans, Martian_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { type Locale, routing } from "@/i18n/routing";
import "../globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "wdth"],
  variable: "--font-bricolage",
  display: "swap",
});

const text = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-instrument",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-martian",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Phones: the page runs edge to edge (content is padded back from the notch and the home
 * indicator with env(safe-area-inset-*)), and the browser bar takes the colour at the top of the
 * page in each scheme. The keyboard keeps resizing only the visual viewport, so the fixed player
 * and navigation stay behind it instead of riding above it.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#171515" },
    { media: "(prefers-color-scheme: light)", color: "#f2ebdd" },
  ],
};

/** Open Graph locale per interface language (language_TERRITORY). */
const OG_LOCALES: Record<Locale, string> = {
  pl: "pl_PL",
  en: "en_US",
  de: "de_DE",
  es: "es_ES",
  fr: "fr_FR",
  pt: "pt_BR",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    applicationName: "Tunewick",
    // Installed on iOS: full screen with the status bar over the page (the header pads below it).
    appleWebApp: { capable: true, title: "Tunewick", statusBarStyle: "black-translucent" },
    openGraph: {
      siteName: "Tunewick",
      type: "website",
      locale: OG_LOCALES[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => OG_LOCALES[l]),
      title: t("title"),
      description: t("description"),
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>
        <NextIntlClientProvider>
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
