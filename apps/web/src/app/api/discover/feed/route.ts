import { isDiscoveryMode } from "@tunewick/shared";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { getFeedPage } from "@/modules/discover";

const querySchema = z.object({
  mode: z.string().refine(isDiscoveryMode).optional(),
  seed: z.coerce
    .number()
    .int()
    .min(0)
    .max(2 ** 31),
  exclude: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").slice(-200) : []))
    .pipe(z.array(z.uuid())),
  start: z
    .string()
    .regex(/^[a-z2-9]{10}$/)
    .optional(),
  artist: z
    .string()
    .regex(/^[a-z0-9-]{2,60}$/)
    .optional(),
  locale: z.enum(routing.locales).default(routing.defaultLocale),
});

/** Next page of the Discover feed (signed preview URLs inside: never cached, never shared). */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const { mode, seed, exclude, start, artist, locale } = parsed.data;
  const page = await getFeedPage({
    mode: mode && isDiscoveryMode(mode) ? mode : undefined,
    seed,
    exclude,
    startCode: start,
    artistSlug: artist,
    locale,
  });
  return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
}
