import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
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

export const metadata: Metadata = { robots: { index: false } };

/** The embed player's own document: no app shell, no session - just the card. */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${display.variable} ${text.variable}`} data-theme="dark">
      <body className="embed-body">{children}</body>
    </html>
  );
}
