import Link from "next/link";

/**
 * Page header of the public website (menu pages and CMS content pages):
 * breadcrumb with the "Opportunity Hub" tag, title with an underline bar, a
 * short line of text, the heritage skyline artwork and an ornamental divider.
 * Decoration is aria-hidden; the text works without it.
 */
export default function PageHero({
  title,
  intro,
  crumbs = [],
  meta,
}: {
  title: string;
  intro?: string;
  crumbs?: { label: string; href?: string }[];
  /** Small line under the intro (e.g. "Last updated: ..."). */
  meta?: React.ReactNode;
}) {
  return (
    <section className="site-hero">
      <span className="site-hero-mandala is-left" aria-hidden="true" />
      <span className="site-hero-mandala is-right" aria-hidden="true" />
      <div className="container site-hero-inner">
        <nav aria-label="Breadcrumb" className="site-crumbs">
          <Link href="/">Home</Link>
          {crumbs.map((c) => (
            <span key={c.label} className="site-crumb">
              <span aria-hidden="true">/</span>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
          <span className="site-hero-tag">Opportunity Hub</span>
        </nav>
        <h1>{title}</h1>
        <span className="site-hero-bar" aria-hidden="true" />
        {intro && <p className="site-hero-intro">{intro}</p>}
        {meta && <div className="site-hero-meta">{meta}</div>}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative static artwork */}
      <img className="site-hero-art" src="/assets/console/header-art.png" alt="" aria-hidden="true" />
      <div className="site-hero-divider" aria-hidden="true">
        <span className="line" />
        <span className="dot" />
        {/* eslint-disable-next-line @next/next/no-img-element -- small static mark */}
        <img src="/assets/console/oh-mark.png" alt="" width={34} height={37} />
        <span className="dot" />
        <span className="line" />
      </div>
    </section>
  );
}
