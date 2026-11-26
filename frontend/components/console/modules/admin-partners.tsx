"use client";

// Administration (Super Admin / Admin full, ZCC view):
//   Engagement Partners   /admin/engagement-partners[/view?id=]   (role 11 accounts, kept apart from artists)
//   Reports & MIS         /admin/reports
/* eslint-disable @next/next/no-img-element -- uploads are served by the Laravel host */
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { http } from "@/lib/api/http";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import { dash, formatDate } from "../crud/common";
import { Pagination } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { confirmAction, failure, promptText, success } from "../ui/alerts";
import { downloadCsv } from "../ui/csv";
import { Kpi, Panel, StatusTabs, dateRange, type Meta, type Requirement } from "./bookings";
import { BarList } from "./partner";

type PartnerRow = {
  id: number; regno: string | null; organisation: string; type: string; contact_person: string; email: string; mobile: string;
  location: string; active: boolean; complete: boolean; verified: boolean; opportunities: number; registered_at: string;
};

/** /admin/engagement-partners */
export function EngagementPartnerList() {
  const { href } = useConsole();
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState({ search: "", type: "", state_id: "" });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams(Object.entries({ ...filters, status, page: String(page) }).filter(([, v]) => v));
  const { data, error, loading } = useApiData<{
    items: PartnerRow[]; meta: Meta; counts: Record<string, number>;
    options: { types: string[]; states: { id: number; name: string }[] }; can_edit: boolean;
  }>(`/engagement-partners?${qs}`);
  const counts = data ? { "": data.counts.all, ...data.counts } : undefined;

  return (
    <div className="container-fluid">
      <PageHeader title="Engagement Partners" />
      <p className="text-muted">Hotels, wedding / event / festival organisers, corporates, cultural institutions and government departments registered to engage artists. Artist / Group accounts (including Organisations / Institutes) are managed under Artist Management.</p>
      <div className="bg-light border rounded-3 shadow-sm p-3 mb-3">
        <form className="row align-items-end g-3" onSubmit={(e) => { e.preventDefault(); setFilters(draft); setPage(1); }}>
          <div className="col-lg-4 col-md-6">
            <label className="form-label fw-bold" htmlFor="ep-search">Search</label>
            <input id="ep-search" type="search" className="form-control" maxLength={100} placeholder="Name, contact, email, mobile, reg. no." value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} />
          </div>
          <div className="col-lg-3 col-md-6">
            <label className="form-label fw-bold" htmlFor="ep-type">Type</label>
            <select id="ep-type" className="form-select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              <option value="">All</option>
              {data?.options.types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-lg-3 col-md-6">
            <label className="form-label fw-bold" htmlFor="ep-state">State / UT</label>
            <select id="ep-state" className="form-select" value={draft.state_id} onChange={(e) => setDraft({ ...draft, state_id: e.target.value })}>
              <option value="">All</option>
              {data?.options.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-lg-2 col-md-6 d-flex gap-2">
            <button type="submit" className="theme-btn rounded-2 py-2 px-3">Go</button>
            <button type="button" className="border-btn rounded-2 py-2 px-2" aria-label="Reset filters" onClick={() => { const n = { search: "", type: "", state_id: "" }; setDraft(n); setFilters(n); setPage(1); }}><i className="bi bi-arrow-counterclockwise" /></button>
          </div>
        </form>
      </div>
      <div className="mb-3">
        <StatusTabs tabs={[["", "All"], ["active", "Active"], ["suspended", "Suspended"], ["verified", "Verified"], ["incomplete", "Profile Incomplete"]]} active={status} counts={counts} onChange={(k) => { setStatus(k); setPage(1); }} />
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead><tr><th className="bk-col-sno">S.No.</th><th>Organisation</th><th>Type</th><th>Contact</th><th>Location</th><th>Opportunities</th><th>Status</th><th className="bk-col-view">View</th></tr></thead>
              <tbody>
                {!data?.items.length ? <tr><td colSpan={8} className="text-center py-4">No engagement partners found.</td></tr> : data.items.map((p, i) => (
                  <tr key={p.id}>
                    <td>{(data.meta.from ?? 1) + i}</td>
                    <td><b>{p.organisation}</b>{p.verified && <i className="bi bi-patch-check-fill text-success ms-1" title="Verified" aria-label="Verified" />}<small className="d-block text-muted">{p.regno} · Registered {formatDate(p.registered_at)}</small></td>
                    <td className="small">{p.type}</td>
                    <td className="small">{p.contact_person}<span className="d-block">{p.mobile}</span><span className="d-block text-break">{p.email}</span></td>
                    <td className="small">{p.location || "—"}</td>
                    <td>{p.opportunities}</td>
                    <td>
                      <span className={`badge ${p.active ? "bg-success" : "bg-danger"}`}>{p.active ? "Active" : "Suspended"}</span>
                      {!p.complete && <span className="badge bg-warning text-dark d-block mt-1">Profile incomplete</span>}
                    </td>
                    <td><Link href={`${href("/engagement-partners/view")}?id=${p.id}`} className="btn btn-sm btn-outline-info" title="View"><i className="bi bi-eye" /><span className="visually-hidden">View</span></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
              <small className="text-muted">Showing {data.meta.from ?? 0}–{data.meta.to ?? 0} of {data.meta.total}</small>
              <Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

type PartnerDetail = {
  account: { id: number; regno: string | null; email: string; mobile: string; active: boolean; registered_at: string; last_login_at: string | null };
  profile: Record<string, string | null> & { completion: number; complete: boolean; verified: boolean };
  stats: Record<"opportunities" | "artists_reached" | "requests_sent" | "bookings" | "completed", number>;
  opportunities: Requirement[];
  can_edit: boolean;
};

/** /admin/engagement-partners/view?id= */
export function EngagementPartnerView() {
  const id = useSearchParams().get("id");
  const { href } = useConsole();
  const { data, error, loading, reload } = useApiData<PartnerDetail>(id ? `/engagement-partners/${encodeURIComponent(id)}` : null);
  const back = href("/engagement-partners");

  async function setActive(active: boolean) {
    if (!data) return;
    let reason: string | null = null;
    if (!active) {
      reason = await promptText("Suspend this account?", "Reason (shown to the partner)", true);
      if (reason === null) return;
    } else if (!(await confirmAction("Activate this account?", "The partner will be able to sign in again.", "Yes, activate"))) return;
    try {
      const res = await http.patch(`/engagement-partners/${data.account.id}/status`, { active, reason });
      await success(res.message);
      reload();
    } catch (e) {
      await failure(e);
    }
  }

  async function setVerified(verified: boolean) {
    if (!data) return;
    if (!(await confirmAction(verified ? "Mark as Verified Partner?" : "Remove verification?",
      verified ? "Artists will see the verified badge on this partner's opportunities." : "The verified badge will be removed.", "Yes"))) return;
    try {
      const res = await http.patch(`/engagement-partners/${data.account.id}/verify`, { verified });
      await success(res.message);
      reload();
    } catch (e) {
      await failure(e);
    }
  }

  if (!id) return <div className="container-fluid"><PageHeader title="Engagement Partner" backHref={back} /><ErrorBox message="No partner selected." /></div>;
  const p = data?.profile;
  return (
    <div className="container-fluid">
      <PageHeader title="Engagement Partner" backHref={back} />
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : p && data && (
        <>
          <section className="oh-card ar-hero compact">
            <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
              <span className="pt-logo">{p.logo ? <img src={p.logo} alt="" /> : <i className="bi bi-building" aria-hidden="true" />}</span>
              <div className="min-w-0">
                <h2 className="ar-hero-name">{p.organisation_name}</h2>
                <div className="ar-hero-meta">
                  <span><i className="bi bi-tags" /> {p.partner_type}</span>
                  <span><i className="bi bi-hash" /> {dash(data.account.regno)}</span>
                  <span className={data.account.active ? "text-success" : "text-danger"}><i className="bi bi-circle-fill" /> {data.account.active ? "Active" : "Suspended"}</span>
                  {p.verified && <span className="text-success"><i className="bi bi-patch-check-fill" /> Verified</span>}
                  <span><i className="bi bi-pie-chart" /> Profile {p.completion}%</span>
                </div>
              </div>
            </div>
            {data.can_edit && (
              <div className="d-flex flex-wrap gap-2">
                {p.verified
                  ? <button type="button" className="btn btn-outline-secondary rounded-2" onClick={() => setVerified(false)}>Remove Verification</button>
                  : <button type="button" className="btn btn-outline-success rounded-2" disabled={!p.complete} title={p.complete ? "" : "Profile incomplete"} onClick={() => setVerified(true)}><i className="bi bi-patch-check me-1" />Verify</button>}
                {data.account.active
                  ? <button type="button" className="btn btn-outline-danger rounded-2" onClick={() => setActive(false)}><i className="bi bi-slash-circle me-1" />Suspend</button>
                  : <button type="button" className="btn btn-success rounded-2" onClick={() => setActive(true)}><i className="bi bi-check-circle me-1" />Activate</button>}
              </div>
            )}
          </section>
          <div className="ar-kpis">
            <Kpi icon="bi-megaphone" label="Opportunities" value={data.stats.opportunities} />
            <Kpi icon="bi-people" label="Artists Reached" value={data.stats.artists_reached} />
            <Kpi icon="bi-send-check" label="Requests Sent" value={data.stats.requests_sent} />
            <Kpi icon="bi-calendar2-check" label="Bookings" value={data.stats.bookings} tone="warn" />
            <Kpi icon="bi-flag" label="Completed" value={data.stats.completed} tone="ok" />
          </div>
          <div className="row g-3">
            <div className="col-lg-8">
              <Panel icon="bi-building" title="Organisation Profile">
                {p.description && <p className="bk-pre">{p.description}</p>}
                <dl className="ar-dl">
                  <div><dt>Address</dt><dd>{[p.address, p.city, p.district, p.state, p.pincode].filter(Boolean).join(", ") || "—"}</dd></div>
                  <div><dt>Website</dt><dd>{p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer">{p.website}</a> : "—"}</dd></div>
                  <div><dt>Supporting Document</dt><dd>{p.document ? <a href={p.document} target="_blank" rel="noopener noreferrer">{p.document_name || "View document"}</a> : "—"}</dd></div>
                  <div><dt>Registered On</dt><dd>{formatDate(data.account.registered_at)}</dd></div>
                  <div><dt>Last Login</dt><dd>{formatDate(data.account.last_login_at, true)}</dd></div>
                </dl>
              </Panel>
              <Panel icon="bi-megaphone" title="Opportunities">
                <div className="table-responsive">
                  <table className="table table-bordered align-middle mb-0">
                    <thead><tr><th>Opportunity</th><th>Event Date</th><th>Status</th><th>Reached / Booked</th><th className="bk-col-view">View</th></tr></thead>
                    <tbody>
                      {!data.opportunities.length ? <tr><td colSpan={5} className="text-center py-3 text-muted">No opportunities posted yet.</td></tr> : data.opportunities.map((r) => (
                        <tr key={r.id}>
                          <td><b>{r.title}</b><small className="d-block text-muted">{r.reference}</small></td>
                          <td className="small">{dateRange(r)}</td>
                          <td>{r.status_label}</td>
                          <td>{r.stats?.matched ?? 0} / {r.stats?.booked ?? 0}</td>
                          <td><Link href={`${href("/bookings/view")}?id=${r.id}`} className="btn btn-sm btn-outline-info"><i className="bi bi-eye" /><span className="visually-hidden">View</span></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
            <div className="col-lg-4">
              <Panel icon="bi-person-lines-fill" title="Contact">
                <dl className="ar-dl single">
                  <div><dt>Contact Person</dt><dd>{p.contact_person}{p.designation ? `, ${p.designation}` : ""}</dd></div>
                  <div><dt>Official Email</dt><dd>{dash(p.official_email)}</dd></div>
                  <div><dt>Contact Number</dt><dd>{dash(p.contact_number)}</dd></div>
                  <div><dt>Login Email</dt><dd>{data.account.email}</dd></div>
                  <div><dt>Login Mobile</dt><dd>{data.account.mobile}</dd></div>
                </dl>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ================================================================ Reports & MIS

type Row = { name: string; total: number; accredited?: number };
type Overview = {
  totals: Record<"registered" | "accredited" | "under_review" | "not_approved" | "partners" | "verified_partners" | "opportunities" | "live_opportunities" | "engagement_requests" | "responses_interested" | "bookings" | "completed", number>;
  by_type: { type: string; total: number; accredited: number; under_review: number; not_approved: number }[];
  by_art_form: Row[]; by_state: Row[]; by_region: Row[]; partners_by_type: Row[];
  opportunities: { by_status: Row[]; by_category: Row[] };
  trend: { month: string; registrations: number; opportunities: number; bookings: number }[];
};

function RowsTable({ rows, label, withAccredited = true, csv }: { rows: Row[]; label: string; withAccredited?: boolean; csv: string }) {
  const total = rows.reduce((s, r) => s + Number(r.total), 0);
  return (
    <>
      <div className="d-flex justify-content-end mb-1">
        <button type="button" className="btn btn-sm btn-link" onClick={() => downloadCsv(csv, withAccredited ? [label, "Total", "Accredited"] : [label, "Total"],
          rows.map((r) => (withAccredited ? [r.name, Number(r.total), Number(r.accredited ?? 0)] : [r.name, Number(r.total)])))}><i className="bi bi-download me-1" />CSV</button>
      </div>
      <div className="table-responsive rp-scroll">
        <table className="table table-sm table-bordered align-middle mb-0">
          <thead><tr><th>{label}</th><th>Total</th>{withAccredited && <th>Accredited</th>}<th>Share</th></tr></thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={4} className="text-center text-muted">No data.</td></tr> : rows.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td>{Number(r.total).toLocaleString("en-IN")}</td>{withAccredited && <td>{Number(r.accredited ?? 0).toLocaleString("en-IN")}</td>}<td>{total ? Math.round((Number(r.total) / total) * 1000) / 10 : 0}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** /admin/reports */
export function ReportsOverview() {
  const { data, error, loading } = useApiData<Overview>("/reports/overview");
  if (loading && !data) return <Loader />;
  if (!data) return <ErrorBox message={error ?? "Unable to load the reports."} />;
  const t = data.totals;
  const month = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Reports & MIS" />
      <div className="ar-kpis">
        <Kpi icon="bi-people" label="Registered Artists / Groups / Institutes" value={t.registered} />
        <Kpi icon="bi-patch-check" label="Accredited (approved)" value={t.accredited} tone="ok" />
        <Kpi icon="bi-hourglass-split" label="Under Review" value={t.under_review} tone="warn" />
        <Kpi icon="bi-x-circle" label="Not Approved" value={t.not_approved} tone="bad" />
        <Kpi icon="bi-buildings" label={`Engagement Partners (${t.verified_partners} verified)`} value={t.partners} />
        <Kpi icon="bi-megaphone" label={`Opportunities (${t.live_opportunities} live)`} value={t.opportunities} />
        <Kpi icon="bi-send-check" label="Engagement Requests" value={t.engagement_requests} />
        <Kpi icon="bi-calendar2-check" label={`Bookings (${t.completed} completed)`} value={t.bookings} tone="ok" />
      </div>

      <Panel icon="bi-diagram-3" title="Individual / Group / Organisation">
        <div className="table-responsive">
          <table className="table table-bordered align-middle mb-0">
            <thead><tr><th>Category</th><th>Registered</th><th>Accredited</th><th>Under Review</th><th>Not Approved</th></tr></thead>
            <tbody>{data.by_type.map((r) => <tr key={r.type}><td>{r.type}</td><td>{r.total}</td><td>{r.accredited}</td><td>{r.under_review}</td><td>{r.not_approved}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>

      <Panel icon="bi-graph-up" title="Trend – last 12 months"
        action={<button type="button" className="btn btn-sm btn-link" onClick={() => downloadCsv("trend.csv", ["Month", "Registrations", "Opportunities", "Bookings"], data.trend.map((r) => [r.month, r.registrations, r.opportunities, r.bookings]))}><i className="bi bi-download me-1" />CSV</button>}>
        <div className="table-responsive">
          <table className="table table-sm table-bordered align-middle mb-0 text-center">
            <thead><tr><th className="text-start">Month</th>{data.trend.map((r) => <th key={r.month}>{month(r.month)}</th>)}</tr></thead>
            <tbody>
              {(["registrations", "opportunities", "bookings"] as const).map((k) => (
                <tr key={k}><th className="text-start text-capitalize">{k}</th>{data.trend.map((r) => <td key={r.month}>{r[k]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="oh-row-2">
        <Panel icon="bi-palette" title="Artists by Art Form"><RowsTable rows={data.by_art_form} label="Art Form" csv="artists-by-art-form.csv" /></Panel>
        <Panel icon="bi-map" title="Artists by State / UT"><RowsTable rows={data.by_state} label="State / UT" csv="artists-by-state.csv" /></Panel>
      </div>
      <div className="oh-row-2">
        <Panel icon="bi-compass" title="Artists by Region / ZCC"><RowsTable rows={data.by_region} label="Region" csv="artists-by-region.csv" /></Panel>
        <Panel icon="bi-buildings" title="Engagement Partners by Type"><BarList rows={data.partners_by_type.map((r) => ({ name: r.name, value: Number(r.total) }))} total={t.partners} /></Panel>
      </div>
      <div className="oh-row-2">
        <Panel icon="bi-list-check" title="Opportunities by Status"><BarList rows={data.opportunities.by_status.map((r) => ({ name: r.name.charAt(0).toUpperCase() + r.name.slice(1), value: Number(r.total) }))} /></Panel>
        <Panel icon="bi-tags" title="Opportunities by Category"><BarList rows={data.opportunities.by_category.map((r) => ({ name: r.name, value: Number(r.total) }))} /></Panel>
      </div>
    </div>
  );
}
