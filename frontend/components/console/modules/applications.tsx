"use client";

// Artist "My Application" (/artist/application/*) and the admin / ZCC
// "Update Requests" screens (/admin/profile-updates/*).
//
// How it works (backend ArtistRevisionService):
//   - registration under review (verified_status 0): the artist saves directly;
//   - approved (1) or rejected (2): every change is an update request
//     (draft -> submitted) that a ZCC Nodal Officer or Admin approves (applied
//     live) or rejects with remarks. The artist gets an email either way.
/* eslint-disable @next/next/no-img-element -- uploads are served by the Laravel host */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { http } from "@/lib/api/http";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import { dash, formatDate } from "../crud/common";
import { Pagination } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { confirmAction, failure, promptText, success } from "../ui/alerts";
import { downloadCsv } from "../ui/csv";

// ------------------------------------------------------------------ types

type RevStatus = "draft" | "submitted" | "approved" | "rejected";
type Summary = { id: number; number: number; status: RevStatus; submitted_at: string | null; decided_at: string | null; updated_at?: string | null; remarks: string | null };
type CompareRow = { field: string; label: string; section: string; before: string; after: string; status: "unchanged" | "changed" | "added" | "removed" };
type DocItem = { label: string; name: string; url: string | null };

const REV_STATUS: Record<RevStatus, [string, string]> = {
  draft: ["Draft", "bg-secondary"],
  submitted: ["Pending Review", "bg-warning text-dark"],
  approved: ["Approved", "bg-success"],
  rejected: ["Rejected", "bg-danger"],
};

const EVENT_LABELS: Record<string, [string, string]> = {
  baseline: ["Approved profile recorded", "bi-flag"],
  draft_saved: ["Draft saved", "bi-pencil-square"],
  submitted: ["Submitted for approval", "bi-send"],
  resubmitted: ["Resubmitted after rejection", "bi-arrow-repeat"],
  approved: ["Approved", "bi-check-circle"],
  rejected: ["Rejected", "bi-x-circle"],
};

const APP_STATUS: Record<number, string> = { 0: "bg-warning text-dark", 1: "bg-success", 2: "bg-danger", 3: "bg-info text-dark" };

export function RevisionBadge({ status }: { status: RevStatus }) {
  const [label, cls] = REV_STATUS[status] ?? [status, "bg-secondary"];
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ------------------------------------------------------------ shared parts

/** Current vs requested values, grouped by section. */
function CompareTable({ rows, beforeLabel = "Current (live)", afterLabel = "Requested" }: { rows: CompareRow[]; beforeLabel?: string; afterLabel?: string }) {
  const [onlyChanged, setOnlyChanged] = useState(true);
  const changed = rows.filter((r) => r.status !== "unchanged").length;
  const shown = onlyChanged && changed ? rows.filter((r) => r.status !== "unchanged") : rows;
  const sections = useMemo(() => {
    const m = new Map<string, CompareRow[]>();
    shown.forEach((r) => m.set(r.section, [...(m.get(r.section) ?? []), r]));
    return [...m.entries()];
  }, [shown]);

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <span className="text-muted small">
          <b className="text-dark">{changed}</b> field{changed === 1 ? "" : "s"} changed
        </span>
        {changed > 0 && (
          <div className="form-check form-switch m-0">
            <input className="form-check-input" type="checkbox" id="only-changed" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
            <label className="form-check-label small" htmlFor="only-changed">Show changed fields only</label>
          </div>
        )}
      </div>
      <div className="table-responsive">
        <table className="table table-bordered align-middle ar-compare">
          <thead>
            <tr>
              <th style={{ width: "24%" }}>Field</th>
              <th style={{ width: "34%" }}>{beforeLabel}</th>
              <th style={{ width: "34%" }}>{afterLabel}</th>
              <th style={{ width: "8%" }}>Change</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(([section, items]) => (
              <SectionRows key={section} section={section} items={items} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SectionRows({ section, items }: { section: string; items: CompareRow[] }) {
  return (
    <>
      <tr className="ar-compare-section">
        <th colSpan={4}>{section}</th>
      </tr>
      {items.map((r) => (
        <tr key={r.field} className={`ar-${r.status}`}>
          <td className="fw-semibold">{r.label}</td>
          <td className="ar-before">{dash(r.before)}</td>
          <td className="ar-after">{dash(r.after)}</td>
          <td>
            {r.status === "unchanged" ? (
              <span className="text-muted small">—</span>
            ) : (
              <span className={`badge ar-badge-${r.status}`}>{r.status === "changed" ? "Changed" : r.status === "added" ? "Added" : "Removed"}</span>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function DocList({ docs, empty = "No documents uploaded." }: { docs: DocItem[]; empty?: string }) {
  if (!docs.length) return <p className="text-muted small mb-0">{empty}</p>;
  return (
    <ul className="ar-docs">
      {docs.map((d, i) => (
        <li key={`${d.label}-${i}`}>
          <i className="bi bi-file-earmark-text" aria-hidden="true" />
          <span className="flex-grow-1">{d.label}</span>
          {d.url ? (
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-secondary">
              <i className="bi bi-box-arrow-up-right me-1" />View
            </a>
          ) : (
            <span className="text-muted small">Not available</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Panel({ icon, title, action, children }: { icon: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="oh-card oh-panel ar-panel">
      <div className="oh-panel-head">
        <h2><i className={`bi ${icon}`} aria-hidden="true" /> {title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Timeline({ events }: { events: { id?: number; action: string; number?: number | null; at: string | null; by?: string; remarks: string | null; changes?: { label: string; before: string; after: string }[] }[] }) {
  if (!events.length) return <p className="text-muted mb-0">No activity yet.</p>;
  return (
    <ol className="ar-timeline">
      {events.map((e, i) => {
        const [label, icon] = EVENT_LABELS[e.action] ?? [e.action, "bi-dot"];
        return (
          <li key={e.id ?? i} className={`ar-ev-${e.action}`}>
            <span className="ar-tl-icon"><i className={`bi ${icon}`} aria-hidden="true" /></span>
            <div className="ar-tl-body">
              <div className="ar-tl-head">
                <b>{label}</b>
                {e.number ? <span className="text-muted"> · Request #{e.number}</span> : null}
                <span className="ar-tl-meta">{formatDate(e.at, true)}{e.by ? ` · ${e.by}` : ""}</span>
              </div>
              {e.remarks && <div className="ar-tl-remarks"><i className="bi bi-chat-left-quote me-1" />{e.remarks}</div>}
              {!!e.changes?.length && (
                <details className="ar-tl-changes">
                  <summary>{e.changes.length} field{e.changes.length === 1 ? "" : "s"} changed</summary>
                  <ul>
                    {e.changes.map((c, j) => (
                      <li key={j}><b>{c.label}:</b> <span className="text-muted text-decoration-line-through">{dash(c.before)}</span> → {dash(c.after)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ======================================================= artist side

const ARTIST_TABS = [
  ["/artist/application", "Overview", "bi-speedometer2"],
  ["/artist/application/details", "Profile Details", "bi-person-lines-fill"],
  ["/artist/application/preview", "Request Preview", "bi-layout-split"],
  ["/artist/application/history", "History", "bi-clock-history"],
] as const;

function ArtistTabs({ active }: { active: string }) {
  return (
    <nav className="ar-tabs" aria-label="My Application">
      {ARTIST_TABS.map(([href, label, icon]) => (
        <Link key={href} href={href} className={href === active ? "active" : ""} aria-current={href === active ? "page" : undefined}>
          <i className={`bi ${icon}`} aria-hidden="true" /> {label}
        </Link>
      ))}
    </nav>
  );
}

type Overview = {
  type: string;
  type_label: string;
  regno: string | null;
  email: string;
  verified_status: number;
  status_label: string;
  profile_completed: boolean;
  completion: number;
  mode: "direct" | "request";
  initial_rejection: string | null;
  changes_requested?: string | null;
  pending: Summary | null;
  draft: Summary | null;
  rejected: Summary | null;
  last_approved: Summary | null;
  recent: Summary[];
  profile: { name: string; photo: string | null; art_forms: string[]; location: string };
};

function ArtistShell({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="container-fluid ar-page">
      <PageHeader title="My Application" />
      <ArtistTabs active={active} />
      {children}
    </div>
  );
}

/** /artist/application */
export function ApplicationOverview() {
  const { data, error, loading } = useApiData<Overview>("/artist/application");
  return (
    <ArtistShell active="/artist/application">
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : data && <OverviewBody d={data} />}
    </ArtistShell>
  );
}

function OverviewBody({ d }: { d: Overview }) {
  const open = d.pending ?? d.draft ?? d.rejected;
  return (
    <>
      <section className="oh-card ar-hero">
        <div className="ar-hero-photo">
          {d.profile.photo ? <img src={d.profile.photo} alt="" /> : <i className="bi bi-person" aria-hidden="true" />}
        </div>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <h2 className="ar-hero-name">{d.profile.name || "—"}</h2>
            <span className={`badge ${APP_STATUS[d.verified_status] ?? "bg-secondary"} ar-pill`}>{d.status_label}</span>
          </div>
          <div className="ar-hero-meta">
            <span><i className="bi bi-person-badge" /> {d.type_label}</span>
            {d.regno && <span><i className="bi bi-hash" /> {d.regno}</span>}
            <span><i className="bi bi-envelope" /> {d.email}</span>
            {d.profile.location && <span><i className="bi bi-geo-alt" /> {d.profile.location}</span>}
          </div>
          {!!d.profile.art_forms.length && (
            <div className="ar-hero-tags">{d.profile.art_forms.map((a) => <span key={a}>{a}</span>)}</div>
          )}
        </div>
        <div className="ar-completion" aria-label={`Profile ${d.completion}% complete`}>
          <div className="ar-ring" style={{ ["--p" as string]: d.completion }}>
            <span>{d.completion}%</span>
          </div>
          <small>Profile complete</small>
        </div>
      </section>

      {d.verified_status === 3 && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2">
          <div className="flex-grow-1">
            <b><i className="bi bi-pencil-square me-2" />Your Zonal Cultural Centre has requested changes.</b>
            {d.changes_requested && <div className="mt-1">Remarks: {d.changes_requested}</div>}
            <div className="small mt-1">Update your profile; it goes back for review when you save.</div>
          </div>
          <Link href="/artist/profile" className="border-btn rounded-2 py-1 px-3">Update profile</Link>
        </div>
      )}
      {d.initial_rejection && !d.pending && (
        <div className="alert alert-danger">
          <b><i className="bi bi-x-octagon me-2" />Your registration was not approved.</b>
          <div className="mt-1">Reason: {d.initial_rejection}</div>
          <div className="small mt-1">Correct your profile and submit it for approval again.</div>
        </div>
      )}

      <div className="ar-steps">
        <Step done icon="bi-person-check" title="Registered" text={d.regno ? `Registration ${d.regno}` : "Account created"} />
        <Step done={d.profile_completed} icon="bi-ui-checks" title="Profile completed" text={d.profile_completed ? "All required details filled" : "Some required details are missing"} />
        <Step
          done={d.verified_status === 1}
          warn={d.verified_status === 2 || d.verified_status === 3}
          icon={d.verified_status === 2 ? "bi-x-circle" : d.verified_status === 3 ? "bi-pencil-square" : "bi-patch-check"}
          title={d.verified_status === 1 ? "Approved" : d.verified_status === 2 ? "Rejected" : d.verified_status === 3 ? "Changes requested" : "Under review"}
          text={d.verified_status === 1 ? "Your profile is live" : d.verified_status === 2 ? "Correct and resubmit" : d.verified_status === 3 ? "Update your profile" : "Awaiting ZCC / Admin review"}
        />
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <Panel icon="bi-arrow-left-right" title="Profile Updates">
            {d.mode === "direct" ? (
              <p className="mb-3">Your registration is still under review, so changes you make on <b>My Profile</b> are saved directly.</p>
            ) : open ? (
              <div className={`ar-open ar-open-${open.status}`}>
                <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <b>Request #{open.number}</b> <RevisionBadge status={open.status} />
                </div>
                <div className="small text-muted">
                  {open.status === "submitted" && <>Submitted on {formatDate(open.submitted_at, true)}. You can edit again after the decision.</>}
                  {open.status === "draft" && <>Draft last saved {formatDate(open.updated_at, true)}. Reviewers cannot see it until you submit it.</>}
                  {open.status === "rejected" && <>Rejected on {formatDate(open.decided_at, true)}.</>}
                </div>
                {open.status === "rejected" && open.remarks && <div className="ar-remarks mt-2"><i className="bi bi-chat-left-quote me-1" />{open.remarks}</div>}
              </div>
            ) : (
              <p className="mb-3">
                No open request. Changes you make on <b>My Profile</b> are sent to the ZCC Nodal Officer / Admin for approval before they go live.
              </p>
            )}
            <div className="d-flex flex-wrap gap-2 mt-3">
              <Link href="/artist/profile" className="cms-btn rounded-2 py-2 px-3">
                <i className={`bi ${d.pending ? "bi-eye" : "bi-pencil-square"} me-1`} />
                {d.pending ? "View My Profile" : d.draft ? "Continue Draft" : d.rejected ? "Correct & Resubmit" : "Edit My Profile"}
              </Link>
              {open && (
                <Link href="/artist/application/preview" className="border-btn rounded-2 py-2 px-3">
                  <i className="bi bi-layout-split me-1" /> Compare Changes
                </Link>
              )}
            </div>
            {d.last_approved && (
              <p className="small text-muted mt-3 mb-0">
                Last approved: request #{d.last_approved.number} on {formatDate(d.last_approved.decided_at, true)}
              </p>
            )}
          </Panel>
        </div>
        <div className="col-lg-5">
          <Panel icon="bi-clock-history" title="Recent Requests" action={<Link href="/artist/application/history" className="oh-viewall">View All <i className="bi bi-arrow-right" /></Link>}>
            {!d.recent.length ? (
              <p className="text-muted mb-0">No update requests yet.</p>
            ) : (
              <ul className="ar-recent">
                {d.recent.map((r) => (
                  <li key={r.id}>
                    <span className="ar-recent-no">#{r.number}</span>
                    <span className="flex-grow-1 small text-muted">{formatDate(r.decided_at ?? r.submitted_at ?? r.updated_at, true)}</span>
                    <RevisionBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Step({ done, warn, icon, title, text }: { done: boolean; warn?: boolean; icon: string; title: string; text: string }) {
  return (
    <div className={`ar-step${done ? " done" : ""}${warn ? " warn" : ""}`}>
      <span className="ar-step-icon"><i className={`bi ${icon}`} aria-hidden="true" /></span>
      <div>
        <b>{title}</b>
        <small>{text}</small>
      </div>
    </div>
  );
}

/** /artist/application/details */
export function ApplicationDetails() {
  const { data, error, loading } = useApiData<{ type_label: string; regno: string | null; email: string; rows: { label: string; section: string; value: string }[]; documents: DocItem[] }>(
    "/artist/application/details"
  );
  const sections = useMemo(() => {
    const m = new Map<string, { label: string; value: string }[]>();
    (data?.rows ?? []).filter((r) => r.section !== "Documents").forEach((r) => m.set(r.section, [...(m.get(r.section) ?? []), r]));
    return [...m.entries()];
  }, [data]);

  return (
    <ArtistShell active="/artist/application/details">
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loader />
      ) : data && (
        <div className="row g-3">
          <div className="col-lg-8">
            {sections.map(([section, rows]) => (
              <Panel key={section} icon="bi-card-list" title={section}>
                <dl className="ar-dl">
                  {rows.map((r) => (
                    <div key={r.label}>
                      <dt>{r.label}</dt>
                      <dd>{dash(r.value)}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            ))}
          </div>
          <div className="col-lg-4">
            <Panel icon="bi-person-badge" title="Account">
              <dl className="ar-dl single">
                <div><dt>Registration Type</dt><dd>{data.type_label}</dd></div>
                <div><dt>Registration No.</dt><dd>{dash(data.regno)}</dd></div>
                <div><dt>Login Email</dt><dd>{data.email}</dd></div>
              </dl>
            </Panel>
            <Panel icon="bi-folder2-open" title="Documents">
              <DocList docs={data.documents} />
            </Panel>
            <Link href="/artist/profile" className="cms-btn rounded-2 py-2 px-3 d-inline-block">
              <i className="bi bi-pencil-square me-1" /> Edit My Profile
            </Link>
          </div>
        </div>
      )}
    </ArtistShell>
  );
}

type PreviewData = { revision: Summary | null; rows: CompareRow[]; changed: number; documents_current?: DocItem[]; documents_proposed?: DocItem[] };

/** /artist/application/preview */
export function ApplicationPreview() {
  const { data, error, loading } = useApiData<PreviewData>("/artist/application/preview");
  return (
    <ArtistShell active="/artist/application/preview">
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loader />
      ) : !data?.revision ? (
        data && (
          <div className="ar-empty">
            <i className="bi bi-inbox" aria-hidden="true" />
            <p>There is no open update request. Edit your profile to create one.</p>
            <Link href="/artist/profile" className="cms-btn rounded-2 py-2 px-3">Edit My Profile</Link>
          </div>
        )
      ) : (
        <>
          <div className={`ar-open ar-open-${data.revision.status} mb-3`}>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <b>Request #{data.revision.number}</b> <RevisionBadge status={data.revision.status} />
              <span className="small text-muted ms-auto">
                {data.revision.status === "draft" ? `Last saved ${formatDate(data.revision.updated_at, true)}` : `Submitted ${formatDate(data.revision.submitted_at, true)}`}
              </span>
            </div>
            {data.revision.status === "rejected" && data.revision.remarks && <div className="ar-remarks mt-2"><i className="bi bi-chat-left-quote me-1" />{data.revision.remarks}</div>}
          </div>
          <Panel icon="bi-layout-split" title="Live Profile vs. Your Request">
            <CompareTable rows={data.rows} beforeLabel="Live profile" afterLabel="Your request" />
          </Panel>
          <div className="row g-3">
            <div className="col-md-6"><Panel icon="bi-folder" title="Live Documents"><DocList docs={data.documents_current ?? []} /></Panel></div>
            <div className="col-md-6"><Panel icon="bi-folder-plus" title="Documents in Request"><DocList docs={data.documents_proposed ?? []} /></Panel></div>
          </div>
          {data.revision.status !== "submitted" && (
            <Link href="/artist/profile" className="cms-btn rounded-2 py-2 px-3 d-inline-block">
              <i className="bi bi-pencil-square me-1" /> {data.revision.status === "rejected" ? "Correct & Resubmit" : "Continue Editing"}
            </Link>
          )}
        </>
      )}
    </ArtistShell>
  );
}

type HistoryData = {
  revisions: (Summary & { decided_by: string | null })[];
  events: { id: number; action: string; number: number | null; at: string | null; by: string; remarks: string | null; changes: { label: string; before: string; after: string }[] }[];
};

/** /artist/application/history */
export function ApplicationHistory() {
  const { data, error, loading } = useApiData<HistoryData>("/artist/application/history");
  return (
    <ArtistShell active="/artist/application/history">
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loader />
      ) : data && (
        <div className="row g-3">
          <div className="col-lg-7">
            <Panel icon="bi-activity" title="Activity">
              <Timeline events={data.events} />
            </Panel>
          </div>
          <div className="col-lg-5">
            <Panel icon="bi-list-ol" title="All Requests">
              {!data.revisions.length ? (
                <p className="text-muted mb-0">No update requests yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-bordered table-striped align-middle mb-0">
                    <thead>
                      <tr><th>#</th><th>Status</th><th>Submitted</th><th>Decided</th></tr>
                    </thead>
                    <tbody>
                      {data.revisions.map((r) => (
                        <tr key={r.id}>
                          <td>{r.number}</td>
                          <td><RevisionBadge status={r.status} />{r.decided_by && <small className="d-block text-muted">by {r.decided_by}</small>}</td>
                          <td className="small">{formatDate(r.submitted_at)}</td>
                          <td className="small">{formatDate(r.decided_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </ArtistShell>
  );
}

// ======================================================= admin / ZCC side

type ListItem = { id: number; number: number; artist_name: string | null; regno: string | null; email: string | null; type_label: string; kind: string; status: RevStatus; submitted_at: string | null; decided_at: string | null; remarks: string | null };
type ListData = { items: ListItem[]; meta: { current_page: number; last_page: number; total: number; from: number | null; to: number | null }; counts: { submitted: number; approved: number; rejected: number }; can_decide: boolean };

const TYPE_FILTER = [["5", "Individual Artist"], ["6", "Artist Group"], ["7", "Organisation / Institute"]] as const;
const TABS: [Exclude<RevStatus, "draft">, string, string][] = [
  ["submitted", "Pending Review", "bi-hourglass-split"],
  ["approved", "Approved", "bi-check-circle"],
  ["rejected", "Rejected", "bi-x-circle"],
];

type Filters = { search: string; registration_type: string; date_from: string; date_to: string };
const NO_FILTERS: Filters = { search: "", registration_type: "", date_from: "", date_to: "" };

/** /admin/profile-updates */
export function ProfileUpdateList() {
  const sp = useSearchParams();
  const { href } = useConsole();
  const [status, setStatus] = useState<string>(sp.get("status") ?? "submitted");
  const [form, setForm] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams(Object.entries({ ...applied, status, page: String(page) }).filter(([, v]) => v !== ""));
  const { data, error, loading } = useApiData<ListData>(`/profile-updates?${qs}`);

  return (
    <div className="container-fluid">
      <PageHeader title="Profile Update Requests" />
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div className="ar-status-tabs" role="tablist" aria-label="Request status">
          {TABS.map(([key, label, icon]) => (
            <button key={key} type="button" role="tab" aria-selected={status === key} className={status === key ? "active" : ""}
              onClick={() => { setStatus(key); setPage(1); }}>
              <i className={`bi ${icon}`} aria-hidden="true" /> {label}
              <span className="ar-count">{data?.counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        <Link href={href("/profile-updates/report")} className="border-btn rounded-2 py-2 px-3">
          <i className="bi bi-file-earmark-bar-graph me-1" /> Report
        </Link>
      </div>

      <div className="bg-light border rounded-3 shadow-sm p-3 mb-3">
        <form onSubmit={(e) => { e.preventDefault(); setApplied(form); setPage(1); }}>
          <div className="row align-items-end g-3">
            <div className="col-lg-3 col-md-6">
              <label className="form-label fw-bold" htmlFor="pu-search">Search</label>
              <input id="pu-search" className="form-control" type="search" maxLength={100} placeholder="Registration no., name or email"
                value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} />
            </div>
            <div className="col-lg-3 col-md-6">
              <label className="form-label fw-bold" htmlFor="pu-type">Registration Type</label>
              <select id="pu-type" className="form-select" value={form.registration_type} onChange={(e) => setForm({ ...form, registration_type: e.target.value })}>
                <option value="">All</option>
                {TYPE_FILTER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="col-lg-2 col-md-6">
              <label className="form-label fw-bold" htmlFor="pu-from">Submitted From</label>
              <input id="pu-from" className="form-control" type="date" value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} />
            </div>
            <div className="col-lg-2 col-md-6">
              <label className="form-label fw-bold" htmlFor="pu-to">Submitted To</label>
              <input id="pu-to" className="form-control" type="date" min={form.date_from || undefined} value={form.date_to} onChange={(e) => setForm({ ...form, date_to: e.target.value })} />
            </div>
            <div className="col-lg-2 col-md-12 d-flex gap-2">
              <button type="submit" className="theme-btn rounded-2 py-2 px-4">Search</button>
              <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={() => { setForm(NO_FILTERS); setApplied(NO_FILTERS); setPage(1); }}>Reset</button>
            </div>
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
                  <th>Registration No. / Type</th>
                  <th>Artist / Group / Institution</th>
                  <th>Request</th>
                  <th>Submitted</th>
                  {status !== "submitted" && <th>Decided</th>}
                  {status === "rejected" && <th>Remarks</th>}
                  <th style={{ width: "8%" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {!data?.items.length ? (
                  <tr><td colSpan={8} className="text-center py-4">No requests found.</td></tr>
                ) : (
                  data.items.map((r, i) => (
                    <tr key={r.id}>
                      <td>{(data.meta.from ?? 1) + i}</td>
                      <td>{dash(r.regno)}<br /><small className="text-muted">{r.type_label}</small></td>
                      <td>{dash(r.artist_name)}<br /><small className="text-muted">{dash(r.email)}</small></td>
                      <td>#{r.number}<br /><small className={r.kind.startsWith("Corrected") ? "text-danger" : "text-muted"}>{r.kind}</small></td>
                      <td className="small">{formatDate(r.submitted_at, true)}</td>
                      {status !== "submitted" && <td className="small">{formatDate(r.decided_at, true)}</td>}
                      {status === "rejected" && <td className="small">{dash(r.remarks)}</td>}
                      <td className="text-nowrap">
                        <Link href={`${href("/profile-updates/review")}?id=${r.id}`} className={`btn btn-sm ${r.status === "submitted" && data.can_decide ? "btn-outline-success" : "btn-outline-info"}`}
                          title={r.status === "submitted" && data.can_decide ? "Review" : "View"}>
                          <i className={`bi ${r.status === "submitted" && data.can_decide ? "bi-clipboard-check" : "bi-eye"}`} />
                        </Link>
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

type ReviewData = {
  revision: { id: number; number: number; status: RevStatus; submitted_at: string | null; decided_at: string | null; decided_by: string | null; remarks: string | null };
  artist: { id: number; name: string; regno: string | null; email: string | null; mobile: string | null; type_label: string; kind: string };
  rows: CompareRow[];
  changed: number;
  documents_current: DocItem[];
  documents_proposed: DocItem[];
  history: Summary[];
  events: { action: string; at: string | null; remarks: string | null }[];
  can_decide: boolean;
};

/** /admin/profile-updates/review?id= */
export function ProfileUpdateReview() {
  const id = useSearchParams().get("id");
  const { href } = useConsole();
  const { data, error, loading, reload } = useApiData<ReviewData>(id ? `/profile-updates/${encodeURIComponent(id)}` : null);
  const [busy, setBusy] = useState(false);
  const back = href("/profile-updates");

  async function decide(decision: "approved" | "rejected") {
    if (!data) return;
    let remarks: string | null = "";
    if (decision === "approved") {
      if (!(await confirmAction("Approve this request?", "The requested changes will go live on the artist's profile and the artist will be informed by email.", "Yes, approve"))) return;
      remarks = await promptText("Approval remarks", "Optional remarks for the artist", false);
      if (remarks === null) return;
    } else {
      remarks = await promptText("Reject this request?", "Reason for rejection (sent to the artist)", true);
      if (remarks === null) return;
    }
    setBusy(true);
    try {
      const res = await http.post(`/profile-updates/${data.revision.id}/decision`, { decision, remarks: remarks || null });
      await success(res.message, decision === "approved" ? "Approved!" : "Rejected!");
      reload();
    } catch (e) {
      await failure(e);
    } finally {
      setBusy(false);
    }
  }

  if (!id) return <div className="container-fluid"><PageHeader title="Review Update Request" backHref={back} /><ErrorBox message="No request selected." /></div>;
  return (
    <div className="container-fluid">
      <PageHeader title="Review Update Request" backHref={back} />
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loader />
      ) : data && (
        <>
          <section className="oh-card ar-hero compact">
            <div className="flex-grow-1 min-w-0">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <h2 className="ar-hero-name">{data.artist.name}</h2>
                <RevisionBadge status={data.revision.status} />
              </div>
              <div className="ar-hero-meta">
                <span><i className="bi bi-person-badge" /> {data.artist.type_label}</span>
                {data.artist.regno && <span><i className="bi bi-hash" /> {data.artist.regno}</span>}
                {data.artist.email && <span><i className="bi bi-envelope" /> {data.artist.email}</span>}
                {data.artist.mobile && <span><i className="bi bi-phone" /> {data.artist.mobile}</span>}
              </div>
              <div className="small mt-1">
                <b>Request #{data.revision.number}</b> · {data.artist.kind} · submitted {formatDate(data.revision.submitted_at, true)}
              </div>
            </div>
            {data.can_decide && (
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-success rounded-2 px-3" disabled={busy} onClick={() => decide("approved")}>
                  <i className="bi bi-check2-circle me-1" /> Approve
                </button>
                <button type="button" className="btn btn-danger rounded-2 px-3" disabled={busy} onClick={() => decide("rejected")}>
                  <i className="bi bi-x-circle me-1" /> Reject
                </button>
              </div>
            )}
          </section>

          {data.revision.status !== "submitted" && (
            <div className={`alert ${data.revision.status === "approved" ? "alert-success" : "alert-danger"}`}>
              <b>{REV_STATUS[data.revision.status][0]}</b> on {formatDate(data.revision.decided_at, true)}
              {data.revision.decided_by && <> by {data.revision.decided_by}</>}
              {data.revision.remarks && <div className="mt-1">Remarks: {data.revision.remarks}</div>}
            </div>
          )}

          <Panel icon="bi-layout-split" title="Current Profile vs. Requested Changes">
            <CompareTable rows={data.rows} beforeLabel={data.revision.status === "approved" ? "Live profile now" : "Current (live)"} afterLabel="Requested" />
          </Panel>

          <div className="row g-3">
            <div className="col-md-6"><Panel icon="bi-folder" title="Current Documents"><DocList docs={data.documents_current} /></Panel></div>
            <div className="col-md-6"><Panel icon="bi-folder-plus" title="Documents in Request"><DocList docs={data.documents_proposed} /></Panel></div>
          </div>

          <div className="row g-3">
            <div className="col-lg-6">
              <Panel icon="bi-activity" title="This Request">
                <Timeline events={data.events} />
              </Panel>
            </div>
            <div className="col-lg-6">
              <Panel icon="bi-list-ol" title="Artist's Request History">
                <div className="table-responsive">
                  <table className="table table-bordered align-middle mb-0">
                    <thead><tr><th>#</th><th>Status</th><th>Submitted</th><th>Remarks</th></tr></thead>
                    <tbody>
                      {data.history.map((h) => (
                        <tr key={h.id} className={h.id === data.revision.id ? "table-warning" : ""}>
                          <td>{h.number}</td>
                          <td><RevisionBadge status={h.status} /></td>
                          <td className="small">{h.submitted_at ? formatDate(h.submitted_at) : "Baseline"}</td>
                          <td className="small">{dash(h.remarks)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type ReportData = {
  totals: { approved_profiles: number; pending: number; approved: number; rejected: number; resubmitted: number };
  by_type: { type: string; submitted: number; approved: number; rejected: number }[];
  rows: { regno: string | null; artist: string | null; email: string | null; type: string; request: number; status: RevStatus; submitted_at: string | null; decided_at: string | null; remarks: string | null }[];
};

/** /admin/profile-updates/report */
export function ProfileUpdateReport() {
  const { href } = useConsole();
  const [range, setRange] = useState({ date_from: "", date_to: "" });
  const [applied, setApplied] = useState(range);
  const qs = new URLSearchParams(Object.entries(applied).filter(([, v]) => v));
  const { data, error, loading } = useApiData<ReportData>(`/profile-updates/report?${qs}`);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `profile-update-requests-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Registration No.", "Artist / Group / Institution", "Email", "Type", "Request #", "Status", "Submitted", "Decided", "Remarks"],
      data.rows.map((r) => [r.regno, r.artist, r.email, r.type, r.request, REV_STATUS[r.status]?.[0] ?? r.status, formatDate(r.submitted_at, true), formatDate(r.decided_at, true), r.remarks])
    );
  };

  const t = data?.totals;
  return (
    <div className="container-fluid">
      <PageHeader title="Update Requests Report" backHref={href("/profile-updates")} />
      <div className="bg-light border rounded-3 shadow-sm p-3 mb-3">
        <form className="row align-items-end g-3" onSubmit={(e) => { e.preventDefault(); setApplied(range); }}>
          <div className="col-md-3">
            <label className="form-label fw-bold" htmlFor="rp-from">Submitted From</label>
            <input id="rp-from" type="date" className="form-control" value={range.date_from} onChange={(e) => setRange({ ...range, date_from: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label fw-bold" htmlFor="rp-to">Submitted To</label>
            <input id="rp-to" type="date" className="form-control" min={range.date_from || undefined} value={range.date_to} onChange={(e) => setRange({ ...range, date_to: e.target.value })} />
          </div>
          <div className="col-md-6 d-flex flex-wrap gap-2">
            <button type="submit" className="theme-btn rounded-2 py-2 px-4">Apply</button>
            <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={() => { const e = { date_from: "", date_to: "" }; setRange(e); setApplied(e); }}>Reset</button>
            <button type="button" className="cms-btn rounded-2 py-2 px-3 ms-md-auto" disabled={!data?.rows.length} onClick={exportCsv}>
              <i className="bi bi-download me-1" /> Export CSV
            </button>
          </div>
        </form>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loader />
      ) : t && (
        <>
          <div className="ar-kpis">
            <Kpi icon="bi-patch-check" label="Approved Profiles" value={t.approved_profiles} />
            <Kpi icon="bi-hourglass-split" label="Pending Requests" value={t.pending} tone="warn" />
            <Kpi icon="bi-check-circle" label="Approved Requests" value={t.approved} tone="ok" />
            <Kpi icon="bi-x-circle" label="Rejected Requests" value={t.rejected} tone="bad" />
            <Kpi icon="bi-arrow-repeat" label="Resubmissions" value={t.resubmitted} />
          </div>
          <Panel icon="bi-diagram-3" title="By Registration Type">
            <div className="table-responsive">
              <table className="table table-bordered table-striped align-middle mb-0">
                <thead><tr><th>Registration Type</th><th>Pending</th><th>Approved</th><th>Rejected</th><th>Total</th></tr></thead>
                <tbody>
                  {!data.by_type.length ? (
                    <tr><td colSpan={5} className="text-center py-3">No requests in this period.</td></tr>
                  ) : (
                    data.by_type.map((b) => (
                      <tr key={b.type}><td>{b.type}</td><td>{b.submitted}</td><td>{b.approved}</td><td>{b.rejected}</td><td className="fw-bold">{b.submitted + b.approved + b.rejected}</td></tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: number; tone?: "ok" | "bad" | "warn" }) {
  return (
    <div className={`ar-kpi${tone ? ` ${tone}` : ""}`}>
      <i className={`bi ${icon}`} aria-hidden="true" />
      <div><b>{value.toLocaleString("en-IN")}</b><small>{label}</small></div>
    </div>
  );
}
