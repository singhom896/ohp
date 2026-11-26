"use client";

// CMS Management -> Newsletter (/admin/newsletter, /admin/newsletter/events,
// /admin/newsletter/events/history?id=). Backend: Console\NewsletterController.
// Visitors subscribe from the website footer and confirm by email; when an
// event is published, "Upcoming Event" emails go to verified subscribers
// automatically. Admins can also send (or resend) them from here.
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { http } from "@/lib/api/http";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import { dash, formatDate } from "../crud/common";
import { Pagination } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { confirmAction, confirmDelete, failure, success } from "../ui/alerts";
import { downloadCsv } from "../ui/csv";

type Meta = { current_page: number; last_page: number; total: number; from?: number | null; to?: number | null };
type Subscriber = {
  id: number; email: string; state: string; state_label: string; status: number; is_verified: boolean;
  subscribed_at: string | null; verified_at: string | null; unsubscribed_at: string | null; created_at: string | null;
};
type SubscriberList = { items: Subscriber[]; meta: Meta; counts: Record<string, number>; states: Record<string, string> };

const STATE_BADGE: Record<string, string> = { active: "bg-success", pending: "bg-warning text-dark", inactive: "bg-secondary", unsubscribed: "bg-danger" };

function Tabs({ active }: { active: "subscribers" | "events" }) {
  const { href } = useConsole();
  return (
    <nav className="ar-tabs" aria-label="Newsletter">
      <Link href={href("/newsletter")} className={active === "subscribers" ? "active" : ""}><i className="bi bi-people" /> Subscribers</Link>
      <Link href={href("/newsletter/events")} className={active === "events" ? "active" : ""}><i className="bi bi-envelope-paper" /> Event Emails</Link>
    </nav>
  );
}

/** /admin/newsletter */
export function NewsletterSubscribers() {
  const { can } = useConsole();
  const [form, setForm] = useState({ search: "", state: "" });
  const [applied, setApplied] = useState(form);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<number | "export" | null>(null);
  const qs = new URLSearchParams(Object.entries({ ...applied, page: String(page) }).filter(([, v]) => v));
  const { data, error, loading, reload } = useApiData<SubscriberList>(`/newsletter?${qs}`);
  const canEdit = can("/newsletter", "edit");
  const canDelete = can("/newsletter", "delete");

  async function toggle(s: Subscriber) {
    const next = s.status ? 0 : 1;
    if (!(await confirmAction(next ? "Activate subscriber?" : "Deactivate subscriber?", next ? `${s.email} will receive newsletter emails again.` : `${s.email} will stop receiving newsletter emails.`, next ? "Yes, activate" : "Yes, deactivate"))) return;
    setBusy(s.id);
    try {
      const res = await http.patch(`/newsletter/${s.id}/status`, { status: next });
      await success(res.message);
      reload();
    } catch (e) {
      await failure(e);
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: Subscriber) {
    if (!(await confirmDelete(s.email))) return;
    setBusy(s.id);
    try {
      const res = await http.delete(`/newsletter/${s.id}`);
      await success(res.message, "Deleted!");
      reload();
    } catch (e) {
      await failure(e);
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setBusy("export");
    try {
      const q = new URLSearchParams(Object.entries(applied).filter(([, v]) => v));
      const res = await http.get<{ items: Subscriber[] }>(`/newsletter/export?${q}`);
      downloadCsv(
        `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`,
        ["S.No.", "Email", "Status", "Subscribed", "Verified", "Unsubscribed", "Created"],
        res.data.items.map((s, i) => [i + 1, s.email, s.state_label, formatDate(s.subscribed_at, true), formatDate(s.verified_at, true), formatDate(s.unsubscribed_at, true), formatDate(s.created_at, true)])
      );
    } catch (e) {
      await failure(e);
    } finally {
      setBusy(null);
    }
  }

  const counts = data?.counts;
  return (
    <div className="container-fluid">
      <PageHeader title="Newsletter" />
      <Tabs active="subscribers" />
      {counts && (
        <div className="ar-kpis">
          <Kpi icon="bi-people" label="Total" value={counts.total} active={!applied.state} onClick={() => { setForm({ ...form, state: "" }); setApplied({ ...applied, state: "" }); setPage(1); }} />
          {(["active", "pending", "inactive", "unsubscribed"] as const).map((k) => (
            <Kpi key={k} icon={k === "active" ? "bi-check-circle" : k === "pending" ? "bi-hourglass-split" : k === "inactive" ? "bi-pause-circle" : "bi-x-circle"}
              label={data.states[k] ?? k} value={counts[k] ?? 0} tone={k === "active" ? "ok" : k === "pending" ? "warn" : k === "unsubscribed" ? "bad" : undefined}
              active={applied.state === k} onClick={() => { setForm({ ...form, state: k }); setApplied({ ...applied, state: k }); setPage(1); }} />
          ))}
        </div>
      )}

      <div className="bg-light border rounded-3 shadow-sm p-3 mb-3">
        <form className="row align-items-end g-3" onSubmit={(e) => { e.preventDefault(); setApplied(form); setPage(1); }}>
          <div className="col-lg-4 col-md-6">
            <label className="form-label fw-bold" htmlFor="nl-search">Search Email</label>
            <input id="nl-search" type="search" className="form-control" maxLength={191} value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="name@example.com" />
          </div>
          <div className="col-lg-3 col-md-6">
            <label className="form-label fw-bold" htmlFor="nl-state">Status</label>
            <select id="nl-state" className="form-select" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
              <option value="">All</option>
              {Object.entries(data?.states ?? {}).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="col-lg-5 d-flex flex-wrap gap-2">
            <button type="submit" className="theme-btn rounded-2 py-2 px-4">Search</button>
            <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={() => { const e = { search: "", state: "" }; setForm(e); setApplied(e); setPage(1); }}>Reset</button>
            <button type="button" className="cms-btn rounded-2 py-2 px-3 ms-lg-auto" disabled={busy === "export" || !data?.meta.total} onClick={exportCsv}>
              {busy === "export" ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-download me-1" />} Export CSV
            </button>
          </div>
        </form>
      </div>

      <ErrorBox message={error} />
      {loading && !data ? (
        <Loader />
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead>
                <tr>
                  <th style={{ width: "6%" }}>S.No.</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Subscribed</th>
                  <th>Unsubscribed</th>
                  {(canEdit || canDelete) && <th style={{ width: "12%" }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {!data?.items.length ? (
                  <tr><td colSpan={6} className="text-center py-4">No subscribers found.</td></tr>
                ) : (
                  data.items.map((s, i) => (
                    <tr key={s.id}>
                      <td>{(data.meta.from ?? 1) + i}</td>
                      <td className="text-break">{s.email}</td>
                      <td><span className={`badge ${STATE_BADGE[s.state] ?? "bg-secondary"}`}>{s.state_label}</span></td>
                      <td className="small">{formatDate(s.subscribed_at ?? s.created_at, true)}</td>
                      <td className="small">{formatDate(s.unsubscribed_at, true)}</td>
                      {(canEdit || canDelete) && (
                        <td className="text-nowrap">
                          {canEdit && s.is_verified && !s.unsubscribed_at && (
                            <button type="button" className={`btn btn-sm ${s.status ? "btn-outline-warning" : "btn-outline-success"} me-1`} disabled={busy === s.id}
                              title={s.status ? "Deactivate" : "Activate"} aria-label={s.status ? "Deactivate subscriber" : "Activate subscriber"} onClick={() => toggle(s)}>
                              <i className={`bi ${s.status ? "bi-pause-circle" : "bi-play-circle"}`} />
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy === s.id} title="Delete" aria-label="Delete subscriber" onClick={() => remove(s)}>
                              <i className="bi bi-trash" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
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

type EventRow = {
  id: number; title: string; venue: string | null; city: string | null; event_date: string | null; upcoming: boolean;
  sent: number; failed: number; awaiting: number; last_sent_at: string | null; status: string;
};
type EventList = { items: EventRow[]; meta: Meta; eligible: number };

const SEND_BADGE: Record<string, string> = { Sent: "bg-success", "Partially sent": "bg-warning text-dark", Failed: "bg-danger", Sending: "bg-info text-dark", "Not sent": "bg-secondary" };

/** /admin/newsletter/events */
export function NewsletterEvents() {
  const { can, href } = useConsole();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<number | null>(null);
  const qs = new URLSearchParams(Object.entries({ search: applied, page: String(page) }).filter(([, v]) => v));
  const { data, error, loading, reload } = useApiData<EventList>(`/newsletter/events?${qs}`);
  const canSend = can("/newsletter", "edit");

  async function send(e: EventRow, mode: "pending" | "all") {
    const text = mode === "pending"
      ? `Email "${e.title}" to the ${e.awaiting} subscriber(s) who have not received it yet.`
      : `Email "${e.title}" again to all ${data?.eligible ?? 0} active subscriber(s), including those already notified.`;
    if (!(await confirmAction(mode === "pending" ? "Send event email?" : "Resend to everyone?", text, "Yes, send"))) return;
    setBusy(e.id);
    try {
      const res = await http.post(`/newsletter/events/${e.id}/send`, { mode });
      await success(res.message, "Done");
      reload();
    } catch (ex) {
      await failure(ex);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container-fluid">
      <PageHeader title="Newsletter" />
      <Tabs active="events" />
      <div className="alert alert-light border d-flex flex-wrap gap-2 align-items-center">
        <i className="bi bi-info-circle" aria-hidden="true" />
        <span className="flex-grow-1">
          When an event is published, an <b>Upcoming Event</b> email is sent automatically to active, verified subscribers.
          Use <b>Send</b> to email subscribers who have not received it yet.
        </span>
        {data && <span className="badge bg-light text-dark border">{data.eligible} active subscriber{data.eligible === 1 ? "" : "s"}</span>}
      </div>
      <div className="bg-light border rounded-3 shadow-sm p-3 mb-3">
        <form className="row align-items-end g-3" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); setPage(1); }}>
          <div className="col-lg-5 col-md-8">
            <label className="form-label fw-bold" htmlFor="ne-search">Event Title</label>
            <input id="ne-search" type="search" className="form-control" maxLength={191} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="col-lg-4 d-flex gap-2">
            <button type="submit" className="theme-btn rounded-2 py-2 px-4">Search</button>
            <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={() => { setSearch(""); setApplied(""); setPage(1); }}>Reset</button>
          </div>
        </form>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loader />
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead>
                <tr>
                  <th style={{ width: "5%" }}>S.No.</th>
                  <th>Event</th>
                  <th>Event Date</th>
                  <th>Email Status</th>
                  <th>Sent / Failed</th>
                  <th>Awaiting</th>
                  <th style={{ width: "16%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {!data?.items.length ? (
                  <tr><td colSpan={7} className="text-center py-4">No published events found.</td></tr>
                ) : (
                  data.items.map((e, i) => (
                    <tr key={e.id}>
                      <td>{(data.meta.from ?? 1) + i}</td>
                      <td>
                        <b>{e.title}</b>
                        <small className="d-block text-muted">{[e.venue, e.city].filter(Boolean).join(", ") || "—"}</small>
                      </td>
                      <td className="small">
                        {formatDate(e.event_date)}
                        {!e.upcoming && <span className="badge bg-light text-muted border ms-1">Past</span>}
                      </td>
                      <td>
                        <span className={`badge ${SEND_BADGE[e.status] ?? "bg-secondary"}`}>{e.status}</span>
                        {e.last_sent_at && <small className="d-block text-muted">{formatDate(e.last_sent_at, true)}</small>}
                      </td>
                      <td>{e.sent} / <span className={e.failed ? "text-danger fw-bold" : ""}>{e.failed}</span></td>
                      <td>{e.upcoming ? e.awaiting : "—"}</td>
                      <td className="text-nowrap">
                        <Link href={`${href("/newsletter/events/history")}?id=${e.id}`} className="btn btn-sm btn-outline-info me-1" title="Delivery history" aria-label="Delivery history">
                          <i className="bi bi-list-check" />
                        </Link>
                        {canSend && e.upcoming && (
                          <>
                            <button type="button" className="btn btn-sm btn-outline-success me-1" disabled={busy === e.id || e.awaiting === 0} title="Send to subscribers not yet notified" onClick={() => send(e, "pending")}>
                              {busy === e.id ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-send" />}
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy === e.id || !data.eligible} title="Resend to all active subscribers" onClick={() => send(e, "all")}>
                              <i className="bi bi-arrow-repeat" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
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

type HistoryData = {
  event: { id: number; title: string; event_date: string | null; published: boolean; upcoming: boolean };
  counts: Record<string, number>;
  items: { email: string; status: string; attempts: number; send_count: number; last_trigger: string | null; sent_at: string | null; last_attempt_at: string | null; last_error: string | null }[];
  meta: Meta;
};
const DELIVERY_BADGE: Record<string, string> = { sent: "bg-success", failed: "bg-danger", sending: "bg-info text-dark", pending: "bg-warning text-dark" };

/** /admin/newsletter/events/history?id= */
export function NewsletterEventHistory() {
  const id = useSearchParams().get("id");
  const { href } = useConsole();
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApiData<HistoryData>(id ? `/newsletter/events/${encodeURIComponent(id)}/history?page=${page}` : null);

  return (
    <div className="container-fluid">
      <PageHeader title="Event Email Deliveries" backHref={href("/newsletter/events")} />
      {!id && <ErrorBox message="No event selected." />}
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loader />
      ) : data && (
        <>
          <div className="alert alert-light border">
            <b>{data.event.title}</b> · {formatDate(data.event.event_date)}
            {!data.event.upcoming && <span className="badge bg-light text-muted border ms-2">Past event</span>}
            <div className="d-flex flex-wrap gap-2 mt-2">
              {Object.entries(data.counts).map(([k, n]) => (
                <span key={k} className={`badge ${DELIVERY_BADGE[k] ?? "bg-secondary"}`}>{k}: {n}</span>
              ))}
              {!Object.keys(data.counts).length && <span className="text-muted small">No emails sent for this event yet.</span>}
            </div>
          </div>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead>
                <tr><th>Email</th><th>Status</th><th>Sent At</th><th>Attempts</th><th>Trigger</th><th>Last Error</th></tr>
              </thead>
              <tbody>
                {!data.items.length ? (
                  <tr><td colSpan={6} className="text-center py-4">No deliveries yet.</td></tr>
                ) : (
                  data.items.map((d, i) => (
                    <tr key={`${d.email}-${i}`}>
                      <td className="text-break">{d.email}</td>
                      <td><span className={`badge ${DELIVERY_BADGE[d.status] ?? "bg-secondary"}`}>{d.status}</span></td>
                      <td className="small">{formatDate(d.sent_at ?? d.last_attempt_at, true)}</td>
                      <td>{d.attempts}{d.send_count > 1 && <small className="text-muted"> ({d.send_count} sent)</small>}</td>
                      <td className="small text-capitalize">{dash(d.last_trigger)}</td>
                      <td className="small text-danger">{dash(d.last_error)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone, active, onClick }: { icon: string; label: string; value: number; tone?: "ok" | "bad" | "warn"; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`ar-kpi${tone ? ` ${tone}` : ""}${active ? " active" : ""}`} onClick={onClick} aria-pressed={active}>
      <i className={`bi ${icon}`} aria-hidden="true" />
      <div><b>{value.toLocaleString("en-IN")}</b><small>{label}</small></div>
    </button>
  );
}
