/** Editorial page opening with an honest empty state for features that are not built yet. */
export function PageIntro({
  title,
  lead,
  empty,
  status,
}: {
  title: string;
  lead: string;
  empty: string;
  status: string;
}) {
  return (
    <section className="page-intro">
      <div className="page-intro__head">
        <h1 className="page-intro__title">{title}</h1>
        <p className="page-intro__lead">{lead}</p>
      </div>
      <div className="page-intro__empty">
        <span className="page-intro__status">{status}</span>
        <p>{empty}</p>
      </div>
    </section>
  );
}
