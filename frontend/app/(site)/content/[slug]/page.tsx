// Public CMS page: /content/<slug> (Privacy Policy, Terms & Conditions, ...).
// Same URLs as the Laravel site and the CMS menu items. Content is written in
// the admin console (CMS Management -> Content) and cached for a few minutes;
// saving it in the console refreshes the cache immediately.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import CmsHtml from "@/components/site/CmsHtml";
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

  const updated = page.updated_at
    ? new Date(page.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <>
      <section className="cms-hero">
        <div className="container">
          <nav aria-label="Breadcrumb" className="cms-crumbs">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{page.title}</span>
          </nav>
          <h1>{page.title}</h1>
          {updated && <p className="cms-updated">Last updated: {updated}</p>}
        </div>
      </section>
      <div className="container">
        <article className="cms-card">
          <CmsHtml html={page.content} />
        </article>
      </div>
    </>
  );
}

function PageSkeleton() {
  return (
    <>
      <section className="cms-hero">
        <div className="container">
          <div className="cms-skel cms-skel-title" />
        </div>
      </section>
      <div className="container">
        <article className="cms-card" aria-busy="true">
          {[90, 100, 96, 70, 100, 85].map((w, i) => (
            <div key={i} className="cms-skel" style={{ width: `${w}%` }} />
          ))}
        </article>
      </div>
    </>
  );
}
