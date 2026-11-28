// Public CMS page: /content/<slug> (Privacy Policy, Terms & Conditions, ...).
// Same URLs as the Laravel site and the CMS menu items. Content is written in
// the admin console (CMS Management -> Content) and cached for a few minutes;
// saving it in the console refreshes the cache immediately.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cmsDocument } from "@/components/site/CmsHtml";
import PageHero from "@/components/site/pages/PageHero";
import { getCmsPage, getFooterLinks } from "@/lib/api/public";

type Props = { params: Promise<{ slug: string }> };

/** Prerender the pages linked from the footer; any other slug renders on first request. */
export async function generateStaticParams() {
  const slugs = (await getFooterLinks())
    .map((l) => /^\/content\/([a-z0-9-]+)$/.exec(l.url)?.[1])
    .filter((s): s is string => !!s);
  // Cache Components needs at least one param to build the route's shell.
  return (slugs.length ? slugs : ["privacy-policy"]).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  // Resolved before the page starts streaming, so a missing page answers 404.
  if (!page) notFound();
  return { title: page.title };
}

export default function ContentPage({ params }: Props) {
  return (
    <main id="main-content" className="cms-page">
      <Suspense fallback={<PageSkeleton />}>
        <PageBody params={params} />
      </Suspense>
    </main>
  );
}

async function PageBody({ params }: Props) {
  const { slug } = await params;
  const page = await getCmsPage(slug);
  if (!page) notFound();

  const doc = cmsDocument(page.content);
  // "On this page" for longer pages (3+ sections).
  const toc = doc.headings.length >= 3 ? doc.headings : [];

  return (
    <>
      <PageHero title={page.title} intro="Official publication of Opportunity Hub — Ministry of Culture." />
      <section className="cms-body">
        <div className="container">
          <div className="cms-head">
            <h2>{page.title}</h2>
            <span className="cms-head-bar" aria-hidden="true" />
          </div>
          <div className={`cms-layout${toc.length ? " has-toc" : ""}`}>
            {toc.length > 0 && (
              <aside className="cms-toc" aria-label="On this page">
                <div className="cms-toc-title"><i className="bi bi-list-ul" aria-hidden="true" /> On this page</div>
                <ol>
                  {toc.map((h) => (
                    <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>
                  ))}
                </ol>
              </aside>
            )}
            <article className="cms-card">
              <div className="cms-content" dangerouslySetInnerHTML={{ __html: doc.html }} />
            </article>
          </div>
          <div className="cms-foot">
            <Link href="/" className="cms-back"><i className="bi bi-arrow-left" aria-hidden="true" /> Back to Home</Link>
            <a href="#main-content" className="cms-top">Back to top <i className="bi bi-arrow-up" aria-hidden="true" /></a>
          </div>
        </div>
      </section>
    </>
  );
}

function PageSkeleton() {
  return (
    <>
      <section className="site-hero">
        <div className="container site-hero-inner">
          <div className="cms-skel cms-skel-title" />
        </div>
      </section>
      <section className="cms-body">
        <div className="container">
          <article className="cms-card" aria-busy="true">
            {[90, 100, 96, 70, 100, 85].map((w, i) => (
              <div key={i} className="cms-skel" style={{ width: `${w}%` }} />
            ))}
          </article>
        </div>
      </section>
    </>
  );
}
