// /artist-list/view?id=1 - public profile of an approved artist / group /
// organisation (no email, mobile or documents).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHero from "@/components/site/pages/PageHero";
import { one } from "@/components/site/pages/Pager";
import { getArtist } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Artist Profile" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function ArtistViewPage({ searchParams }: Props) {
  return (
    <main id="main-content" className="op-page">
      <Suspense fallback={<div className="container op-loading">Loading profile…</div>}>
        <ArtistBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ArtistBody({ searchParams }: Props) {
  const id = Number(one((await searchParams).id)) || 0;
  const data = id ? await getArtist(id) : null;

  if (!data) {
    return (
      <>
        <PageHero title="Profile not found" crumbs={[{ label: "Artists", href: "/artist-list" }]} />
        <div className="container"><p className="op-empty">This profile is not available. <Link href="/artist-list">See all artists</Link>.</p></div>
      </>
    );
  }

  const a = data.item;
  return (
    <>
      <PageHero title={a.name} crumbs={[{ label: "Artists", href: "/artist-list" }]} />
      <div className="container op-detail">
        <aside className="op-detail-side op-profile-card">
          <span className="op-avatar lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the Laravel host */}
            {a.photo ? <img src={a.photo} alt={a.name} /> : <i className="bi bi-person" aria-hidden="true" />}
          </span>
          <span className="op-type">{a.type_label}</span>
          <h2 className="op-profile-name">{a.name}</h2>
          {a.real_name && <p className="op-muted">{a.real_name}</p>}
          {a.location && <p className="op-artist-loc"><i className="bi bi-geo-alt" aria-hidden="true" /> {a.location}</p>}
          {a.art_forms.length > 0 && <ul className="op-chips center">{a.art_forms.map((f) => <li key={f}>{f}</li>)}</ul>}
        </aside>

        <div className="op-detail-main">
          <article className="cms-card op-card-flat">
            <h2 className="op-h2">About</h2>
            {a.about ? <p className="op-about">{a.about}</p> : <p className="op-muted">No introduction added yet.</p>}

            {a.facts.length > 0 && (
              <dl className="op-facts grid">
                {a.facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{/^https?:\/\//.test(f.value) ? <a href={f.value} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}</dd>
                  </div>
                ))}
                {a.languages.length > 0 && (
                  <div>
                    <dt>Languages</dt>
                    <dd>{a.languages.join(", ")}</dd>
                  </div>
                )}
              </dl>
            )}
          </article>

          {a.awards.length > 0 && (
            <section className="cms-card op-card-flat">
              <h2 className="op-h2">Awards &amp; Recognition</h2>
              <ul className="op-awards">
                {a.awards.map((w, i) => (
                  <li key={i}>
                    <i className="bi bi-trophy" aria-hidden="true" />
                    <div><b>{w.name}</b>{w.year ? <span className="op-muted"> · {w.year}</span> : null}{w.description && <p>{w.description}</p>}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.links.length > 0 && (
            <section className="cms-card op-card-flat">
              <h2 className="op-h2">Work Samples</h2>
              <ul className="op-links">
                {a.links.map((l) => (
                  <li key={l}><a href={l} target="_blank" rel="noopener noreferrer"><i className="bi bi-link-45deg" aria-hidden="true" /> {l.replace(/^https?:\/\//, "")}</a></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
