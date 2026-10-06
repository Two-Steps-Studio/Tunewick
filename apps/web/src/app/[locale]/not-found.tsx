import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <section className="flex flex-col gap-6 py-16">
      <h1 className="font-display text-[length:var(--tk-text-3xl)] leading-[0.95] font-extrabold tracking-tight">
        {t("title")}
      </h1>
      <Link href="/" className="w-fit underline underline-offset-4">
        {t("back")}
      </Link>
    </section>
  );
}
