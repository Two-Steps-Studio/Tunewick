import { getTranslations } from "next-intl/server";
import { SegmentLoading } from "@/components/feedback/segment-error";

export default async function ChartsLoading() {
  const t = await getTranslations("Charts");
  return <SegmentLoading label={t("loading")} />;
}
