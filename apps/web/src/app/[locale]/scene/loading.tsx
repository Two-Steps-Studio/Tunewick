import { getTranslations } from "next-intl/server";
import { SegmentLoading } from "@/components/feedback/segment-error";

// Shown at once on navigation while the page loads (this route never answers 404, so streaming
// a 200 early is safe).
export default async function SceneLoading() {
  const t = await getTranslations("Shell");
  return <SegmentLoading label={t("loading")} />;
}
