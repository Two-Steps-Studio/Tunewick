import { Link } from "@/i18n/navigation";
import type { SubjectHref } from "../queries";

/** The reported subject's name, linked to its page when it still has one. */
export function SubjectLink({
  subject,
}: {
  subject: { title: string; href: SubjectHref | null } | null;
}) {
  if (!subject?.href) {
    return <span className="artist-list__name">{subject?.title ?? "—"}</span>;
  }
  return (
    <Link className="artist-list__name" href={subject.href}>
      {subject.title}
    </Link>
  );
}
