export default function Row({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="row-section">
      <div className="row-head">
        <h2>{title}</h2>
      </div>
      <div className="row-scroll">{children}</div>
    </section>
  );
}
