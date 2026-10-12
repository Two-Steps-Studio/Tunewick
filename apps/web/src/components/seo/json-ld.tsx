import { jsonLd } from "@/lib/site";

/** Structured data for search engines (schema.org JSON-LD), rendered on the server. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Serialized by jsonLd(), which escapes "<" so the data cannot close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />;
}

/** 245000 ms → "PT4M5S" (ISO 8601 duration). */
export function isoDuration(ms: number | null | undefined): string | undefined {
  if (!ms || ms <= 0) return undefined;
  const total = Math.round(ms / 1000);
  return `PT${Math.floor(total / 60)}M${total % 60}S`;
}
