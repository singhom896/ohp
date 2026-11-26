import Link from "next/link";

/** Page header used by the menu pages: breadcrumb, kicker, title, short intro. */
export default function PageHero({
  title,
  intro,
  crumbs = [],
}: {
  title: string;
  intro?: string;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <section className="cms-hero op-hero">
      <div className="container">
        <nav aria-label="Breadcrumb" className="cms-crumbs">
          <Link href="/">Home</Link>
          {crumbs.map((c) => (
            <span key={c.label} className="op-crumb">
              <span aria-hidden="true">/</span>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </nav>
        <span className="op-kicker">Opportunity Hub · For Indian Artists</span>
        <h1>{title}</h1>
        {intro && <p className="op-intro">{intro}</p>}
      </div>
    </section>
  );
}
