// /opportunities/view?id=1 - one public opportunity (no contact details).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHero from "@/components/site/pages/PageHero";
import { fmtDate, one } from "@/components/site/pages/Pager";
import { getOpportunity } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Opportunity Details" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function OpportunityViewPage({ searchParams }: Props) {
  return (
    <main id="main-content" className="op-page">
      <Suspense fallback={<div className="container op-loading">Loading opportunity…</div>}>
        <OpportunityBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function OpportunityBody({ searchParams }: Props) {
  const id = Number(one((await searchParams).id)) || 0;
  const data = id ? await getOpportunity(id) : null;

  if (!data) {
    return (
      <>
        <PageHero title="Opportunity not found" crumbs={[{ label: "Discover Opportunities", href: "/opportunities" }]} />
        <div className="container"><p className="op-empty">This opportunity is closed or no longer available. <Link href="/opportunities">See all opportunities</Link>.</p></div>
      </>
    );
  }

  const o = data.item;
  const when = `${fmtDate(o.event_date)}${o.event_end_date && o.event_end_date !== o.event_date ? ` – ${fmtDate(o.event_end_date)}` : ""}`;
  return (
    <>
      <PageHero title={o.title} intro={`${o.organisation}${o.organisation_type ? ` · ${o.organisation_type}` : ""}`} crumbs={[{ label: "Discover Opportunities", href: "/opportunities" }]} />
      <div className="container">
        <div className="pop-detail">
          <div>
            <section className="pop-box">
              <h2>About the event</h2>
              <p className="pop-pre">{o.description}</p>
            </section>
            {o.artist_requirements && (
              <section className="pop-box">
                <h2>Artist / Group requirements</h2>
                <p className="pop-pre">{o.artist_requirements}</p>
              </section>
            )}
          </div>
          <aside>
            <section className="pop-box">
              <h2>Details</h2>
              <dl>
                <dt>Reference</dt><dd>{o.reference}</dd>
                {o.category && (<><dt>Category</dt><dd>{o.category}</dd></>)}
                <dt>Art form</dt><dd>{o.art_form}</dd>
                <dt>Looking for</dt><dd>{o.artist_type}{o.performers_needed ? ` · ${o.performers_needed} artist(s)` : ""}</dd>
                {o.language && (<><dt>Language</dt><dd>{o.language}</dd></>)}
                <dt>Date</dt><dd>{when}{o.event_time ? `, ${o.event_time}${o.end_time ? ` – ${o.end_time}` : ""}` : ""}</dd>
                {o.duration && (<><dt>Duration</dt><dd>{o.duration}</dd></>)}
                <dt>Venue</dt><dd>{[o.venue, o.place].filter(Boolean).join(", ")}</dd>
                {o.audience_size && (<><dt>Audience</dt><dd>{o.audience_size}</dd></>)}
                {o.budget && (<><dt>Honorarium</dt><dd>{o.budget}</dd></>)}
                {o.respond_by && (<><dt>Respond by</dt><dd>{fmtDate(o.respond_by)}</dd></>)}
              </dl>
            </section>
            <section className="pop-box">
              <h2>Interested?</h2>
              <p className="pop-pre mb-3">Approved artists, groups and institutes whose profile matches receive this opportunity in their dashboard and can respond there. Opportunity Hub does not charge any fee.</p>
              <div className="d-flex flex-wrap gap-2">
                <Link href="/login" className="pop-cta">Login to respond</Link>
                <Link href="/register?as=artist" className="op-btn op-btn-ghost">Register as Artist / Group</Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
