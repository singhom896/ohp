import Link from "next/link";
import type { PageMeta } from "@/lib/api/pages";

/** Numbered pages as plain links (?page=N), keeping the other filters. */
export default function Pager({ meta, basePath, query }: { meta: PageMeta; basePath: string; query: Record<string, string | undefined> }) {
  if (meta.last_page <= 1) return null;

  const href = (page: number) => {
    const qs = new URLSearchParams(Object.entries({ ...query, page: page > 1 ? String(page) : undefined }).filter((e): e is [string, string] => !!e[1]));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const cur = meta.current_page;
  const pages = Array.from({ length: meta.last_page }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === meta.last_page || Math.abs(p - cur) <= 1
  );

  return (
    <nav className="op-pager" aria-label="Pages">
      {cur > 1 ? <Link href={href(cur - 1)} aria-label="Previous page"><i className="bi bi-chevron-left" /></Link> : <span className="off"><i className="bi bi-chevron-left" /></span>}
      {pages.map((p, i) => (
        <span key={p} className="op-pager-group">
          {i > 0 && p - pages[i - 1] > 1 && <span className="gap">…</span>}
          {p === cur ? <span className="on" aria-current="page">{p}</span> : <Link href={href(p)}>{p}</Link>}
        </span>
      ))}
      {cur < meta.last_page ? <Link href={href(cur + 1)} aria-label="Next page"><i className="bi bi-chevron-right" /></Link> : <span className="off"><i className="bi bi-chevron-right" /></span>}
    </nav>
  );
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
