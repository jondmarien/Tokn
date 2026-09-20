/**
 * A titled group of settings rows.
 *
 * Grouping is the only structure this page has — there are no cards and no
 * borders — so each heading has to carry its weight: it says which part of the
 * account the rows beneath it belong to.
 */
export function SettingsGroup({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-group">
      <header>
        <h2 className="group-title">{title}</h2>
        {note && <p className="micro">{note}</p>}
      </header>
      {children}
    </section>
  );
}
