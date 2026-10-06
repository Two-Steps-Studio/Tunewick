import { z } from "zod";

export const BENEFITS = ["premium_days", "premium_months", "premium_lifetime"] as const;
export type Benefit = (typeof BENEFITS)[number];

const optionalInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(min).max(max).nullable());

const requiredInt = (min: number, max: number) =>
  z.string().trim().min(1).transform(Number).pipe(z.number().int().min(min).max(max));

const optionalDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/)
  .transform((v) => (v === "" ? null : v));

export const campaignSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500),
  partner: z.string().trim().max(120),
  endsOn: optionalDate,
  maxTotal: optionalInt(1, 1_000_000),
});

const benefitFields = {
  benefit: z.enum(BENEFITS),
  value: optionalInt(1, 3660),
  expiresOn: optionalDate,
  newAccountsDays: optionalInt(1, 365),
};

function benefitIsComplete(v: { benefit: Benefit; value: number | null }) {
  if (v.benefit === "premium_lifetime") return true;
  if (v.value === null) return false;
  return v.benefit === "premium_months" ? v.value <= 120 : true;
}

export const generateSchema = z
  .object({ ...benefitFields, count: requiredInt(1, 5000) })
  .refine(benefitIsComplete, { path: ["value"] });

export const sharedSchema = z
  .object({
    ...benefitFields,
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{4,30}[A-Za-z0-9]$/),
    maxUses: requiredInt(1, 1_000_000),
  })
  .refine(benefitIsComplete, { path: ["value"] });

/** End of the given day in Poland, as Postgres reads it (DST-aware). */
export function endOfDayInPoland(date: string | null) {
  return date === null ? null : `${date} 23:59:59 Europe/Warsaw`;
}

/** The database stores no value for lifetime codes. */
export function benefitValue(v: { benefit: Benefit; value: number | null }) {
  return v.benefit === "premium_lifetime" ? null : v.value;
}

export function toCsv(codes: string[], campaign: string) {
  const quoted = `"${campaign.replaceAll('"', '""')}"`;
  return `code,campaign\n${codes.map((code) => `${code},${quoted}`).join("\n")}\n`;
}
