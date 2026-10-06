/** Editorial auth layout: large title on the left, form on the right (stacked on mobile). */
export function AuthPage({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="auth-page">
      <div className="auth-page__head">
        <h1 className="auth-page__title">{title}</h1>
        <p className="auth-page__lead">{lead}</p>
      </div>
      <div className="auth-page__body">
        {children}
        {footer ? <div className="auth-page__footer">{footer}</div> : null}
      </div>
    </section>
  );
}
