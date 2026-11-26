"use client";

// React version of the DataTables setup used on the panel's list pages
// (`new DataTable('.table-data', { pageLength: 10 })`): entries per page,
// search box, sortable columns, "Showing x to y of z entries", pagination.
// Client-side, because those endpoints return the full list like the Blade views.
import { Fragment, useMemo, useState } from "react";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  /** Cell content; defaults to row[key]. */
  render?: (row: T, index: number) => React.ReactNode;
  /** Value used for search + sort; defaults to row[key]. */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  className?: string;
  width?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  emptyText?: string;
  pageSizes?: number[];
  /** First column "S.No" numbering is added automatically. */
  serial?: boolean;
};

function cellValue<T>(col: Column<T>, row: T): string | number {
  const v = col.value ? col.value(row) : (row as Record<string, unknown>)[col.key];
  return typeof v === "number" ? v : v == null ? "" : String(v);
}

export default function DataTable<T>({ columns, rows, rowKey, emptyText = "No data available in table", pageSizes = [10, 25, 50, 100], serial = true }: Props<T>) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = q ? rows.filter((r) => columns.some((c) => String(cellValue(c, r)).toLowerCase().includes(q))) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const x = cellValue(col, a);
          const y = cellValue(col, b);
          if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
          return String(x).localeCompare(String(y), undefined, { numeric: true }) * sort.dir;
        });
      }
    }
    return out;
  }, [rows, columns, search, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  return (
    <div className="dt-container px-0">
      <div className="dt-toolbar">
        <label className="dt-length">
          <select
            className="form-select form-select-sm me-2"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Entries per page"
          >
            {pageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          entries per page
        </label>
        <label className="dt-search">
          Search:
          <input
            type="search"
            className="form-control form-control-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      <div className="table-responsive">
        <table className="table table-bordered table-data">
          <thead>
            <tr>
              {serial && <th style={{ width: "6%" }}>S.No</th>}
              {columns.map((c) => {
                const sorted = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={c.sortable === false ? undefined : `sortable${sorted ? " sorted" : ""}`}
                    aria-sort={sorted ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                    onClick={
                      c.sortable === false
                        ? undefined
                        : () => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))
                    }
                  >
                    {c.header}
                    {c.sortable !== false && (
                      <i className={`bi ${sorted ? (sort!.dir === 1 ? "bi-caret-up-fill" : "bi-caret-down-fill") : "bi-chevron-expand"}`} />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="dt-empty" colSpan={columns.length + (serial ? 1 : 0)}>
                  {rows.length === 0 ? emptyText : "No matching records found"}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr key={rowKey(row)}>
                  {serial && <td>{start + i + 1}</td>}
                  {columns.map((c) => (
                    <td key={c.key} className={c.className}>
                      {c.render ? c.render(row, start + i) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="dt-footer">
        <div className="dt-info" role="status" aria-live="polite">
          {filtered.length === 0
            ? "Showing 0 to 0 of 0 entries"
            : `Showing ${start + 1} to ${start + visible.length} of ${filtered.length} entries`}
          {filtered.length !== rows.length && ` (filtered from ${rows.length} total entries)`}
        </div>
        <Pagination current={current} pages={pages} onPage={setPage} />
      </div>
    </div>
  );
}

export function Pagination({ current, pages, numbers, onPage }: { current: number; pages: number; numbers?: number[]; onPage: (p: number) => void }) {
  const nums = numbers ?? [...new Set([1, pages, current - 1, current, current + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination">
      <ul className="pagination pagination-sm">
        <li className={`page-item${current === 1 ? " disabled" : ""}`}>
          <button type="button" className="page-link" onClick={() => onPage(current - 1)} aria-label="Previous">
            ‹
          </button>
        </li>
        {nums.map((n, i) => (
          <Fragment key={n}>
            {i > 0 && n - nums[i - 1] > 1 && (
              <li className="page-item disabled">
                <span className="page-link">…</span>
              </li>
            )}
            <li className={`page-item${n === current ? " active" : ""}`}>
              <button type="button" className="page-link" onClick={() => onPage(n)} aria-current={n === current ? "page" : undefined}>
                {n}
              </button>
            </li>
          </Fragment>
        ))}
        <li className={`page-item${current === pages ? " disabled" : ""}`}>
          <button type="button" className="page-link" onClick={() => onPage(current + 1)} aria-label="Next">
            ›
          </button>
        </li>
      </ul>
    </nav>
  );
}
