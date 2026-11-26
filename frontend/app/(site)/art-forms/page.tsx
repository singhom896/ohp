// /art-forms - art form categories and their forms, from Data Management ->
// Art Forms (main category + subcategories). Menu: Administration -> Menus.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import PageHero from "@/components/site/pages/PageHero";
import { getArtForms } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Art Forms" };

const ICONS = ["bi-music-note-beamed", "bi-person-arms-up", "bi-mask", "bi-flower1", "bi-palette", "bi-brush", "bi-book", "bi-stars"];

export default function ArtFormsPage() {
  return (
    <main id="main-content" className="op-page">
      <PageHero title="Art Forms" intro="Explore the art forms and traditions practised by artists registered on Opportunity Hub." />
      <div className="container">
        <Suspense fallback={<div className="op-loading">Loading art forms…</div>}>
          <ArtFormGrid />
        </Suspense>
      </div>
    </main>
  );
}

async function ArtFormGrid() {
  const groups = await getArtForms();
  if (!groups.length) return <p className="op-empty">No art forms have been published yet.</p>;

  return (
    <div className="op-artforms">
      {groups.map((g, i) => (
        <article key={g.id} className="op-artform">
          <div className="op-artform-icon"><i className={`bi ${ICONS[i % ICONS.length]}`} aria-hidden="true" /></div>
          <h2>{g.name}</h2>
          {g.description && <p>{g.description}</p>}
          {g.forms.length > 0 && (
            <ul className="op-chips" aria-label={`${g.name} forms`}>
              {g.forms.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
          <Link className="op-link" href={`/artist-list?art_form=${g.id}`}>
            View artists <i className="bi bi-arrow-right" aria-hidden="true" />
          </Link>
        </article>
      ))}
    </div>
  );
}
