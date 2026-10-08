import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { renderSongCard } from "@/modules/discover";

/** Song share card: ?format=story (1080×1920) | square (1080×1080), ?locale=pl|en. */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/cards/song/[code]">,
) {
  const { code } = await params;
  if (!/^[a-z2-9]{10}$/.test(code)) return new NextResponse(null, { status: 404 });
  const search = request.nextUrl.searchParams;
  const format = search.get("format") === "square" ? "square" : "story";
  const requested = search.get("locale") ?? "";
  const locale = (routing.locales as readonly string[]).includes(requested)
    ? (requested as (typeof routing.locales)[number])
    : routing.defaultLocale;
  const card = await renderSongCard(code, format, locale, request.nextUrl.origin);
  return card ?? new NextResponse(null, { status: 404 });
}
