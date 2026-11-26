// /artist-list - approved artists, artist groups and organisations (Artist
// Management, status Approved) with search and filters. Contact details are
// never shown publicly.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHero from "@/components/site/pages/PageHero";
import Pager, { one } from "@/components/site/pages/Pager";
import { getArtists, type ArtistCard } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Artists" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function ArtistsPage({ searchParams }: Props) {
  return (
    <main id="main-content" className="op-page">
      <PageHero title="Artists" intro="Discover verified artists, artist groups and cultural organisations from across India." />
      <div className="container">
        <Suspense fallback={<div className="op-loading">Loading artists…</div>}>
          <ArtistList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

const TYPE_ICON: Record<ArtistCard["type"], string> = { individual: "bi-person", group: "bi-people", organisation: "bi-building" };

async function ArtistList({ searchParams }: Props) {
  const sp = await searchParams;
  const q = { search: one(sp.search), type: one(sp.type), art_form: one(sp.art_form), state_id: one(sp.state_id), page: one(sp.page) };
  const data = await getArtists(q);

  return (
    <>
      <form className="op-filters" method="get" role="search">
        <label className="op-field op-grow">
          <span>Search</span>
          <span className="op-input"><i className="bi bi-search" aria-hidden="true" /><input type="search" name="search" defaultValue={q.search} placeholder="Artist, group or city…" /></span>
        </label>
        <label className="op-field">
          <span>Type</span>
          <select name="type" defaultValue={q.type ?? ""}>
            <option value="">All types</option>
            {data?.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
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
          <a className="op-btn op-btn-ghost" href="/artist-list">Reset</a>
        </div>
      </form>

      {!data || !data.items.length ? (
        <p className="op-empty">No artists found.</p>
      ) : (
        <>
          <p className="op-count">Showing {data.meta.from}–{data.meta.to} of {data.meta.total} ({data.total} registered and verified)</p>
          <div className="op-artists">
            {data.items.map((a) => (
              <Link key={a.id} href={`/artist-list/view?id=${a.id}`} className="op-artist">
                <span className="op-avatar">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by the Laravel host */}
                  {a.photo ? <img src={a.photo} alt="" loading="lazy" decoding="async" /> : <i className={`bi ${TYPE_ICON[a.type]}`} aria-hidden="true" />}
                </span>
                <span className="op-type">{a.type_label}</span>
                <b className="op-artist-name">{a.name}</b>
                {a.art_forms.length > 0 && <span className="op-artist-forms">{a.art_forms.slice(0, 3).join(" · ")}</span>}
                {a.location && <span className="op-artist-loc"><i className="bi bi-geo-alt" aria-hidden="true" /> {a.location}</span>}
                <span className="op-link">View profile <i className="bi bi-arrow-right" aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
          <Pager meta={data.meta} basePath="/artist-list" query={{ ...q, page: undefined }} />
        </>
      )}
    </>
  );
}
