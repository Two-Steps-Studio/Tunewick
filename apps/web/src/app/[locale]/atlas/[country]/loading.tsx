import { getTranslations } from "next-intl/server";
import { SegmentLoading } from "@/components/feedback/segment-error";

export default async function AtlasLoading() {
  const t = await getTranslations("Atlas");
  return <SegmentLoading rows={6} label={t("loading")} />;
}
