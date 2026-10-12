import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Tunewick";

/** The default link preview: the wordmark and the promise, in the page's language. */
export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "linear-gradient(160deg, #7657ff 0%, #171515 60%)",
        color: "#f2ebdd",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ width: 40, height: 40, background: "#ff5c5c" }} />
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2 }}>tunewick</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 64, lineHeight: 1.05, letterSpacing: -2, maxWidth: 960 }}>
          {t("description")}
        </div>
        <div style={{ fontSize: 30, color: "#d8ff3e" }}>{t("tagline")}</div>
      </div>
    </div>,
    size,
  );
}
