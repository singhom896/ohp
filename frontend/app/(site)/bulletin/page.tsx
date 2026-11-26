// /bulletin - published documents and announcements (CMS Management ->
// Documents: active and within their publish dates). Filters are a GET form.
import type { Metadata } from "next";
import { Suspense } from "react";
import PageHero from "@/components/site/pages/PageHero";
import Pager, { fmtDate, one } from "@/components/site/pages/Pager";
import { getDocuments } from "@/lib/api/pages";

export const metadata: Metadata = { title: "Bulletin" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function BulletinPage({ searchParams }: Props) {
  return (
    <main id="main-content" className="op-page">
      <PageHero title="Bulletin" intro="Official announcements, notifications, guidelines and publications." />
      <div className="container">
        <Suspense fallback={<div className="op-loading">Loading documents…</div>}>
          <Documents searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Documents({ searchParams }: Props) {
  const sp = await searchParams;
  const q = { search: one(sp.search), sort: one(sp.sort), per_page: one(sp.per_page), page: one(sp.page) };
  const data = await getDocuments(q);

  return (
    <>
      <form className="op-filters" method="get" role="search">
        <label className="op-field op-grow">
          <span>Search documents</span>
          <span className="op-input"><i className="bi bi-search" aria-hidden="true" /><input type="search" name="search" defaultValue={q.search} placeholder="Search title or keyword…" /></span>
        </label>
        <label className="op-field">
          <span>Sort</span>
          <select name="sort" defaultValue={q.sort ?? "desc"}>
            <option value="desc">Latest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
        <label className="op-field">
          <span>Per page</span>
          <select name="per_page" defaultValue={q.per_page ?? "10"}>
            <option value="10">10</option><option value="20">20</option><option value="30">30</option>
          </select>
        </label>
        <div className="op-actions">
          <button type="submit" className="op-btn">Search</button>
          <a className="op-btn op-btn-ghost" href="/bulletin">Reset</a>
        </div>
      </form>

      {!data || !data.items.length ? (
        <p className="op-empty">No documents found.</p>
      ) : (
        <>
          <p className="op-count">Showing {data.meta.from}–{data.meta.to} of {data.meta.total} documents</p>
          <ul className="op-docs">
            {data.items.map((d) => (
              <li key={d.id} className="op-doc">
                <span className={`op-doc-icon ${d.kind}`} aria-hidden="true">
                  <i className={`bi ${d.kind === "link" ? "bi-link-45deg" : d.extension === "PDF" ? "bi-file-earmark-pdf" : "bi-file-earmark-text"}`} />
                </span>
                <div className="op-doc-body">
                  <h2>{d.title}</h2>
                  {d.description && <p>{d.description}</p>}
                  <div className="op-doc-meta">
                    <span><i className="bi bi-calendar3" aria-hidden="true" /> {fmtDate(d.date)}</span>
                    {d.kind === "file" && d.extension && <span>{d.extension}{d.size ? ` · ${d.size}` : ""}</span>}
                    {d.kind === "link" && <span>External link</span>}
                  </div>
                </div>
                {d.url && (
                  <a className="op-btn op-btn-sm" href={d.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${d.title}`}>
                    {d.kind === "link" ? "Visit" : "View"} <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
                  </a>
                )}
              </li>
            ))}
          </ul>
          <Pager meta={data.meta} basePath="/bulletin" query={{ ...q, page: undefined }} />
        </>
      )}
    </>
  );
}
