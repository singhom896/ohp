// /opportunities - "Discover Opportunities": live opportunities that Engagement
// Partners posted publicly. No contact details here; artists respond after login.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHero from "@/components/site/pages/PageHero";
import Pager, { fmtDate, one } from "@/components/site/pages/Pager";
import { getOpportunities } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Discover Opportunities" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function OpportunitiesPage({ searchParams }: Props) {
  return (
    <main id="main-content" className="op-page">
      <PageHero title="Discover Opportunities" intro="Performance opportunities posted by hotels, event and festival organisers, corporates, cultural institutions and government departments." crumbs={[{ label: "Find Opportunities" }]} />
      <div className="container">
        <Suspense fallback={<div className="op-loading">Loading opportunities…</div>}>
          <OpportunityList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function OpportunityList({ searchParams }: Props) {
  const sp = await searchParams;
  const q = { search: one(sp.search), art_form: one(sp.art_form), state_id: one(sp.state_id), page: one(sp.page) };
  const data = await getOpportunities(q);

  return (
    <>
      <form className="op-filters" method="get" role="search">
        <label className="op-field op-grow">
          <span>Opportunity or city</span>
          <span className="op-input"><i className="bi bi-search" aria-hidden="true" /><input type="search" name="search" defaultValue={q.search} placeholder="Search opportunities…" /></span>
        </label>
        <label className="op-field">
          <span>Art form</span>
          <select name="art_form" defaultValue={q.art_form ?? ""}>
            <option value="">All art forms</option>
            {data?.art_forms.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>State / UT</span>
          <select name="state_id" defaultValue={q.state_id ?? ""}>
            <option value="">All States / UTs</option>
            {data?.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="op-actions">
          <button type="submit" className="op-btn">Search</button>
          <a className="op-btn op-btn-ghost" href="/opportunities">Reset</a>
        </div>
      </form>

      {!data || !data.items.length ? (
        <p className="op-empty">No open opportunities right now. Register as an artist to be notified when one matches your profile.</p>
      ) : (
        <>
          <div className="pop-grid">
            {data.items.map((o) => (
              <Link key={o.id} href={`/opportunities/view?id=${o.id}`} className="pop-card">
                {o.category && <span className="pop-tag">{o.category}</span>}
                <h3>{o.title}</h3>
                <span className="pop-org"><i className="bi bi-building" aria-hidden="true" /> {o.organisation}{o.verified && <i className="bi bi-patch-check-fill ms-1" title="Verified partner" aria-label="Verified partner" />}</span>
                <ul>
                  <li><i className="bi bi-palette" aria-hidden="true" /> {o.art_form} · {o.artist_type}</li>
                  <li><i className="bi bi-calendar3" aria-hidden="true" /> {fmtDate(o.event_date)}{o.event_time ? `, ${o.event_time}` : ""}</li>
                  <li><i className="bi bi-geo-alt" aria-hidden="true" /> {[o.venue, o.place].filter(Boolean).join(", ")}</li>
                  {o.respond_by && <li><i className="bi bi-alarm" aria-hidden="true" /> Respond by {fmtDate(o.respond_by)}</li>}
                </ul>
                <span className="pop-more">View details <i className="bi bi-arrow-right" aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
          <Pager meta={data.meta} basePath="/opportunities" query={{ ...q, page: undefined }} />
        </>
      )}
    </>
  );
}
