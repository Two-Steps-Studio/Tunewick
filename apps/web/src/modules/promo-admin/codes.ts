/** Promo code benefits and CSV export (no zod: safe to bundle in client components). */

export const BENEFITS = ["premium_days", "premium_months", "premium_lifetime"] as const;
export type Benefit = (typeof BENEFITS)[number];

export function toCsv(codes: string[], campaign: string) {
  const quoted = `"${campaign.replaceAll('"', '""')}"`;
  return `code,campaign\n${codes.map((code) => `${code},${quoted}`).join("\n")}\n`;
}
