import { z } from "zod";
import { AD_LOCALES, AD_PLACEMENTS } from "./constants";

const optionalDate = z
  .string()
  .trim()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v));

/** The admin form: a campaign links either to a release ("artist/release") or to an https site. */
export const adCampaignSchema = z
  .object({
    advertiser: z.string().trim().min(1).max(80),
    headline: z.string().trim().min(1).max(80),
    body: z.string().trim().max(160),
    cta: z.string().trim().min(1).max(24),
    url: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https:\/\/[^\s/$.?#][^\s]*$/.test(v)),
    release: z
      .string()
      .trim()
      .refine((v) => v === "" || /^[a-z0-9-]+\/[a-z0-9-]+$/.test(v)),
    placements: z.array(z.enum(AD_PLACEMENTS)).min(1),
    locales: z.array(z.enum(AD_LOCALES)),
    weight: z.coerce.number().int().min(1).max(10),
    startsOn: optionalDate,
    endsOn: optionalDate,
  })
  .refine((v) => (v.url === "") !== (v.release === ""), { path: ["url"] })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { path: ["endsOn"] });

export type AdCampaignInput = z.infer<typeof adCampaignSchema>;
