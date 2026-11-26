// /events - Upcoming / Past events (Event Management, active events only) with
// filters by title, State / UT, city and date. Filters are a GET form.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHero from "@/components/site/pages/PageHero";
import Pager, { fmtDate, one } from "@/components/site/pages/Pager";
import { getEvents } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Events" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function EventsPage({ searchParams }: Props) {
  return (
    <main id="main-content" className="op-page">
      <PageHero title="Events" intro="Cultural programmes, festivals and performances across India." crumbs={[{ label: "Media" }]} />
      <div className="container">
        <Suspense fallback={<div className="op-loading">Loading events…</div>}>
          <EventList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function EventList({ searchParams }: Props) {
  const sp = await searchParams;
  const type = one(sp.type) === "past" ? "past" : "upcoming";
  const q = { type, title: one(sp.title), state_id: one(sp.state_id), city: one(sp.city), date: one(sp.date), page: one(sp.page) };
  const data = await getEvents(q);
  const filters = { title: q.title, state_id: q.state_id, city: q.city, date: q.date };
  const tabHref = (t: string) => `/events?${new URLSearchParams(Object.entries({ ...filters, type: t }).filter((e): e is [string, string] => !!e[1]))}`;

  return (
    <>
      <div className="op-tabs" role="tablist" aria-label="Events">
        <Link role="tab" aria-selected={type === "upcoming"} className={type === "upcoming" ? "on" : ""} href={tabHref("upcoming")}>
          <i className="bi bi-calendar-event" aria-hidden="true" /> Upcoming ({data?.counts.upcoming ?? 0})
        </Link>
        <Link role="tab" aria-selected={type === "past"} className={type === "past" ? "on" : ""} href={tabHref("past")}>
          <i className="bi bi-clock-history" aria-hidden="true" /> Past ({data?.counts.past ?? 0})
        </Link>
      </div>

      <form className="op-filters" method="get" role="search">
        <input type="hidden" name="type" value={type} />
        <label className="op-field op-grow">
          <span>Event title</span>
          <span className="op-input"><i className="bi bi-search" aria-hidden="true" /><input type="search" name="title" defaultValue={q.title} placeholder="Search events…" /></span>
        </label>
        <label className="op-field">
          <span>State / UT</span>
          <select name="state_id" defaultValue={q.state_id ?? ""}>
            <option value="">All States / UTs</option>
            {data?.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="op-field">
          <span>City / District</span>
          <input type="text" name="city" defaultValue={q.city} placeholder="City" />
        </label>
        <label className="op-field">
          <span>Date</span>
          <input type="date" name="date" defaultValue={q.date} />
        </label>
        <div className="op-actions">
          <button type="submit" className="op-btn">Search</button>
          <a className="op-btn op-btn-ghost" href={`/events?type=${type}`}>Reset</a>
        </div>
      </form>

      {!data || !data.items.length ? (
        <p className="op-empty">No {type} events found.</p>
      ) : (
        <>
          <div className="op-events">
            {data.items.map((e) => (
              <article key={e.id} className="op-event">
                <Link href={`/events/view?id=${e.id}`} className="op-event-img" tabIndex={-1} aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by the Laravel host */}
                  {e.image ? <img src={e.image} alt="" loading="lazy" decoding="async" /> : <i className="bi bi-calendar-event" />}
                  <span className="op-date-badge">
                    <b>{new Date(`${e.start_date}T00:00:00`).getDate()}</b>
                    {new Date(`${e.start_date}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  </span>
                </Link>
                <div className="op-event-body">
                  <h2><Link href={`/events/view?id=${e.id}`}>{e.title}</Link></h2>
                  <ul className="op-meta">
                    <li><i className="bi bi-calendar3" aria-hidden="true" /> {fmtDate(e.start_date)}{e.start_time ? `, ${e.start_time}` : ""}{e.end_date && e.end_date !== e.start_date ? ` – ${fmtDate(e.end_date)}` : ""}</li>
                    {(e.venue || e.place) && <li><i className="bi bi-geo-alt" aria-hidden="true" /> {[e.venue, e.place].filter(Boolean).join(", ")}</li>}
                    {e.organised_by && <li><i className="bi bi-building" aria-hidden="true" /> {e.organised_by}</li>}
                  </ul>
                  {e.excerpt && <p>{e.excerpt}</p>}
                  <Link className="op-link" href={`/events/view?id=${e.id}`}>View details <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
                </div>
              </article>
            ))}
          </div>
          <Pager meta={data.meta} basePath="/events" query={q.type === "upcoming" ? { ...q, type: undefined, page: undefined } : { ...q, page: undefined }} />
        </>
      )}
    </>
  );
}
