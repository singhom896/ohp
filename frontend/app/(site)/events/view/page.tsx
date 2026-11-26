// /events/view?id=1 - one event with its description and media.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import CmsHtml from "@/components/site/CmsHtml";
import MediaGallery from "@/components/site/pages/MediaGallery";
import PageHero from "@/components/site/pages/PageHero";
import { fmtDate, one } from "@/components/site/pages/Pager";
import { getEvent } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Event Details" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function EventViewPage({ searchParams }: Props) {
  return (
    <main id="main-content" className="op-page">
      <Suspense fallback={<div className="container op-loading">Loading event…</div>}>
        <EventBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function EventBody({ searchParams }: Props) {
  const id = Number(one((await searchParams).id)) || 0;
  const data = id ? await getEvent(id) : null;

  if (!data) {
    return (
      <>
        <PageHero title="Event not found" crumbs={[{ label: "Events", href: "/events" }]} />
        <div className="container"><p className="op-empty">This event is not available. <Link href="/events">See all events</Link>.</p></div>
      </>
    );
  }

  const e = data.item;
  return (
    <>
      <PageHero title={e.title} crumbs={[{ label: "Events", href: e.upcoming ? "/events" : "/events?type=past" }]} />
      <div className="container op-detail">
        <aside className="op-detail-side">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the Laravel host */}
          {e.image && <img className="op-detail-cover" src={e.image} alt="" />}
          <dl className="op-facts">
            <dt>Date</dt>
            <dd>{fmtDate(e.start_date)}{e.start_time ? `, ${e.start_time}` : ""}{e.end_date ? ` – ${fmtDate(e.end_date)}${e.end_time ? `, ${e.end_time}` : ""}` : ""}</dd>
            {e.venue && (<><dt>Venue</dt><dd>{e.venue}</dd></>)}
            {e.place && (<><dt>Location</dt><dd>{e.place}</dd></>)}
            {e.address && (<><dt>Address</dt><dd>{[e.address, e.pincode].filter(Boolean).join(" - ")}</dd></>)}
            {e.organised_by && (<><dt>Organised by</dt><dd>{e.organised_by}</dd></>)}
          </dl>
          <span className={`op-status ${e.upcoming ? "up" : "past"}`}>{e.upcoming ? "Upcoming event" : "Past event"}</span>
        </aside>
        <div className="op-detail-main">
          <article className="cms-card op-card-flat">
            <h2 className="op-h2">About the event</h2>
            {e.description ? <CmsHtml html={e.description} /> : <p>No description available.</p>}
          </article>
          {(data.photos.length > 0 || data.videos.length > 0) && (
            <section className="op-section">
              <h2 className="op-h2">Event media</h2>
              <MediaGallery data={{ albums: data.photos.map((p) => ({ ...p, subtitle: null, date: null, title: p.title ?? e.title })), videos: data.videos, event_photos: [], event_videos: [] }} compact />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
