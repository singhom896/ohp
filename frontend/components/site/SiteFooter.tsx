import Link from "next/link";
import { Suspense } from "react";
import { resolveMenuHref } from "@/lib/data/site-navigation";
import { getFooterMenu, type MenuEntry } from "@/lib/api/public";
import NewsletterForm from "./NewsletterForm";

type FooterColumn = { heading: string; links: { label: string; href: string; external: boolean }[] };

/**
 * Footer menus WITHOUT child menus are split like the Laravel website footer:
 * the first QUICK_LINKS_COUNT (by "Order") under "Quick Links", the rest under "Policies".
 */
const QUICK_LINKS_COUNT = 4;

/**
 * Footer columns from Administration -> Menus ("Footer Menu", by "Order"):
 * a footer menu WITH child menus is a column (its title = heading, children =
 * links); the other footer menus fill "Quick Links" and "Policies".
 * URLs are the ones set in the admin.
 */
function toColumns(menu: MenuEntry[]): FooterColumn[] {
  const link = (m: { title: string; url: string; target: string }) => {
    const href = resolveMenuHref(m.url);
    return href ? { label: m.title, href, external: m.target === "_blank" } : null;
  };
  const columns: FooterColumn[] = menu
    .filter((m) => m.children.length)
    .map((m) => ({ heading: m.title, links: m.children.map(link).filter((l) => l !== null) }));
  const single = menu.filter((m) => !m.children.length).map(link).filter((l) => l !== null);
  columns.push({ heading: "Quick Links", links: single.slice(0, QUICK_LINKS_COUNT) });
  columns.push({ heading: "Policies", links: single.slice(QUICK_LINKS_COUNT) });
  return columns.filter((c) => c.links.length);
}

/** Used while the CMS menu loads, or if Laravel is unreachable. */
const FALLBACK_COLUMNS: FooterColumn[] = [
  {
    heading: "Quick Links",
    links: [
      { label: "About Us", href: "/about-us", external: false },
      { label: "Contact Us", href: "/contact-us", external: false },
      { label: "Help Centre", href: "/help-centre", external: false },
    ],
  },
];

function FooterColumns({ columns }: { columns: FooterColumn[] }) {
  return (
    <div className="footer-cols" style={{ "--cols": columns.length } as React.CSSProperties}>
      {columns.map((column) => (
        <div key={column.heading} className="footer-col">
          <h4 className="footer-heading">{column.heading}</h4>
          <ul className="footer-links">
            {column.links.map((l) => (
              <li key={`${l.label}-${l.href}`}>
                {l.external || /^https?:\/\//i.test(l.href) ? (
                  <a href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>
                ) : (
                  <Link href={l.href}>{l.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

async function LiveColumns() {
  const columns = toColumns(await getFooterMenu());
  return <FooterColumns columns={columns.length ? columns : FALLBACK_COLUMNS} />;
}

/** Decorative waves: maroon top edge with a gold line. */
function TopWave() {
  return (
    <svg className="footer-wave footer-wave-top" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 0H1440V6C1080 62 360 62 0 6Z" fill="#7a1d3b" />
      <path d="M0 6C360 62 1080 62 1440 6" fill="none" stroke="#d6a648" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Decorative waves at the bottom: navy hill, gold line, maroon and saffron bands. */
function BottomWave() {
  return (
    <svg className="footer-wave footer-wave-bottom" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 78C220 40 520 24 820 34S1260 56 1440 40V150H0Z" fill="#132a55" />
      <path d="M0 86C480 74 960 74 1440 86V150H0Z" fill="#7a1d3b" />
      <path d="M0 86C480 74 960 74 1440 86" fill="none" stroke="#d6a648" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d="M0 136C480 118 960 112 1440 116V128C960 124 480 130 0 146Z" fill="#df7a26" />
    </svg>
  );
}

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <TopWave />
      <div className="footer">
        <span className="footer-star footer-star-a" aria-hidden="true">✦</span>
        <span className="footer-star footer-star-b" aria-hidden="true">✦</span>

        <div className="container footer-grid">
          <Suspense fallback={<FooterColumns columns={FALLBACK_COLUMNS} />}>
            <LiveColumns />
          </Suspense>

          {/* Right half (6 of 12): divider + newsletter box. */}
          <div className="footer-side">
            <div className="footer-divider" aria-hidden="true">
              <span>✦</span>
            </div>

            <div className="newsletter">
              <h4 className="footer-heading">Stay in the Loop</h4>
              <p>Subscribe for official Opportunity Hub updates and cultural events</p>
              <NewsletterForm />
            </div>
          </div>
        </div>
      </div>

      <BottomWave />
      <div className="footer-pattern" aria-hidden="true" />
    </footer>
  );
}
