"use client";

// Audit Trail -> Login History (backend/views/backend/logs/list.blade.php).
// Server-side paginated: the table grows with every login.
import { useState } from "react";
import { useApiData } from "../crud/useApi";
import { dash, formatDate } from "../crud/common";
import { Pagination } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";

type Log = {
  id: number; user: string | null; email: string | null; role: string | null; regno: string | null; ip_address: string | null;
  device: string | null; browser: string | null; platform: string | null; is_success: boolean; logged_in_at: string | null; logged_out_at: string | null;
};
type Data = { items: Log[]; meta: { current_page: number; last_page: number; per_page: number; total: number } };

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const { data, error, loading } = useApiData<Data>(`/logs?page=${page}&per_page=25${applied ? `&search=${encodeURIComponent(applied)}` : ""}`);
  const from = data ? (data.meta.current_page - 1) * data.meta.per_page : 0;

  return (
    <div className="container-fluid">
      <PageHeader title="Login History" />
      <ErrorBox message={error} />

      <form
        className="d-flex justify-content-end gap-2 mb-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search.trim());
          setPage(1);
        }}
      >
        <input type="search" className="form-control w-auto" placeholder="Name, email, Reg. No. or IP" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search login history" />
        <button type="submit" className="theme-btn rounded-2">Search</button>
      </form>

      {loading && !data ? (
        <Loader />
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-data">
              <thead>
                <tr>
                  <th>S.No</th><th>User</th><th>Role</th><th>Reg. No.</th><th>IP Address</th><th>Device / Browser / Platform</th><th>Login</th><th>Logout</th><th>Result</th>
                </tr>
              </thead>
              <tbody>
                {!data?.items.length ? (
                  <tr><td colSpan={9} className="dt-empty">No login history found.</td></tr>
                ) : (
                  data.items.map((l, i) => (
                    <tr key={l.id}>
                      <td>{from + i + 1}</td>
                      <td>{dash(l.user)}<br /><small className="text-muted">{dash(l.email)}</small></td>
                      <td>{dash(l.role)}</td>
                      <td>{dash(l.regno)}</td>
                      <td>{dash(l.ip_address)}</td>
                      <td>{[l.device, l.browser, l.platform].filter(Boolean).join(" / ") || "—"}</td>
                      <td>{formatDate(l.logged_in_at, true)}</td>
                      <td>{formatDate(l.logged_out_at, true)}</td>
                      <td>{l.is_success ? <span className="badge bg-success">Success</span> : <span className="badge bg-danger">Failed</span>}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data && (
            <div className="dt-footer">
              <div className="dt-info">Showing {data.items.length ? from + 1 : 0} to {from + data.items.length} of {data.meta.total} entries</div>
              <Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
