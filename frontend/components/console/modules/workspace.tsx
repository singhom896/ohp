"use client";

// Account workspace screens:
//   Notifications        /artist/notifications, /partner/notifications (own in-app notifications)
//   Artist Members       /artist/group-members        (Artist Group accounts)
//   Registration Card    /artist/registration-card    (Artist / Group / Organisation)
/* eslint-disable @next/next/no-img-element -- uploads are served by the Laravel host */
import Link from "next/link";
import { useState } from "react";
import { http } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import { dash, formatDate } from "../crud/common";
import { Pagination } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { confirmDelete, failure, success } from "../ui/alerts";
import { SelectInput, TextInput } from "../ui/fields";
import type { Meta } from "./bookings";

// ================================================================ notifications

type Notice = { id: number; title: string; body: string | null; url: string | null; read: boolean; created_at: string };

/** /artist/notifications and /partner/notifications */
export function Notifications() {
  const { base } = useConsole();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const { data, error, loading, setData } = useApiData<{ items: Notice[]; meta: Meta; unread: number }>(`/notifications?page=${page}${unreadOnly ? "&unread=1" : ""}`);

  async function markRead(n: Notice) {
    if (n.read || !data) return;
    try {
      const res = await http.patch<{ unread: number }>(`/notifications/${n.id}/read`);
      setData({ ...data, unread: res.data.unread, items: data.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
    } catch {
      /* not critical */
    }
  }

  async function readAll() {
    if (!data) return;
    try {
      const res = await http.post("/notifications/read-all");
      setData({ ...data, unread: 0, items: data.items.map((x) => ({ ...x, read: true })) });
      await success(res.message);
    } catch (e) {
      await failure(e);
    }
  }

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Notifications" />
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" role="switch" id="nt-unread" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} />
          <label className="form-check-label" htmlFor="nt-unread">Unread only{data ? ` (${data.unread})` : ""}</label>
        </div>
        <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={readAll} disabled={!data?.unread}><i className="bi bi-check2-all me-1" />Mark all as read</button>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : !data?.items.length ? (
        <div className="ar-empty"><i className="bi bi-bell-slash" aria-hidden="true" /><p>No notifications.</p></div>
      ) : (
        <>
          <ul className="nt-list">
            {data.items.map((n) => {
              const body = (
                <>
                  <span className={`nt-dot${n.read ? " read" : ""}`} aria-hidden="true" />
                  <div className="min-w-0 flex-grow-1">
                    <b className="d-block">{n.title}</b>
                    {n.body && <span className="d-block text-muted small">{n.body}</span>}
                  </div>
                  <time className="small text-muted text-nowrap" dateTime={n.created_at}>{formatDate(n.created_at, true)}</time>
                </>
              );
              return (
                <li key={n.id} className={n.read ? "" : "unread"}>
                  {n.url ? <Link href={`${base}${n.url}`} onClick={() => markRead(n)}>{body}</Link> : <button type="button" onClick={() => markRead(n)}>{body}</button>}
                </li>
              );
            })}
          </ul>
          <div className="d-flex justify-content-end mt-3"><Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} /></div>
        </>
      )}
    </div>
  );
}

// ================================================================ group members

type Member = { id: number; name: string; regno: string | null; location: string; art_forms: string[]; photo: string | null; member_role?: string; added_at?: string };

/** /artist/group-members (Artist Group accounts) */
export function GroupMembers() {
  const { can } = useConsole();
  const { data, error, loading, reload } = useApiData<{ group: string; items: Member[]; roles: string[] }>("/artist/group-members");
  const [regno, setRegno] = useState("");
  const [role, setRole] = useState("Artist Member");
  const [found, setFound] = useState<Member | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const canAdd = can("/group-members", "create");

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFound(null);
    try {
      const res = await http.get<{ artist: Member }>(`/artist/group-members/lookup?regno=${encodeURIComponent(regno.trim())}`);
      setFound(res.data.artist);
    } catch (ex) {
      if (ex instanceof ApiError) setErrors(Object.keys(ex.errors).length ? ex.errors : { regno: [ex.message] });
      else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!found) return;
    setBusy(true);
    try {
      const res = await http.post("/artist/group-members", { regno: found.regno, member_role: role });
      await success(res.message);
      setFound(null);
      setRegno("");
      reload();
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) setErrors(ex.errors);
      else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Member) {
    if (!(await confirmDelete(`${m.name} from the group`))) return;
    try {
      const res = await http.delete(`/artist/group-members/${m.id}`);
      await success(res.message);
      reload();
    } catch (e) {
      await failure(e);
    }
  }

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Artist Members" />
      {data && <p className="text-muted">Registered artists who are members of <b>{data.group}</b>.</p>}
      {canAdd && (
        <section className="oh-card oh-panel ar-panel">
          <div className="alert alert-warning py-2"><i className="bi bi-info-circle me-2" />Only registered individual artists can be added. Enter the Registration ID shown on the artist&apos;s Opportunity Hub profile.</div>
          <form className="row g-3 align-items-end" onSubmit={lookup} noValidate>
            <div className="col-lg-5 col-md-6"><TextInput name="regno" label="Artist Registration ID" icon="bi-hash" required maxLength={50} placeholder="e.g. OH-AI-00012" value={regno} onChange={setRegno} error={errors.regno?.[0]} /></div>
            <div className="col-lg-4 col-md-6"><SelectInput name="member_role" label="Member Role" icon="bi-person-badge" required value={role} onChange={setRole} options={(data?.roles ?? []).map((r) => ({ value: r, label: r }))} error={errors.member_role?.[0]} /></div>
            <div className="col-lg-3 d-flex gap-2">
              <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={() => { setRegno(""); setFound(null); setErrors({}); }}>Clear</button>
              <button type="submit" className="cms-btn rounded-2 py-2 px-3" disabled={busy || !regno.trim()}>Find Artist</button>
            </div>
          </form>
          {found && (
            <div className="gm-found">
              <span className="bk-avatar">{found.photo ? <img src={found.photo} alt="" /> : <i className="bi bi-person" aria-hidden="true" />}</span>
              <div className="flex-grow-1 min-w-0">
                <b className="d-block">{found.name}</b>
                <small className="text-muted">{found.regno} · {found.art_forms.join(", ") || "—"} · {found.location || "—"}</small>
              </div>
              <button type="button" className="cms-btn rounded-2 py-2 px-3" onClick={add} disabled={busy}><i className="bi bi-person-plus me-1" />Add as {role}</button>
            </div>
          )}
        </section>
      )}
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : (
        <section className="oh-card oh-panel ar-panel">
          <div className="oh-panel-head"><h2><i className="bi bi-people" aria-hidden="true" /> Current Artist Members</h2><span className="badge bg-light text-dark border">{data?.items.length ?? 0} members</span></div>
          <div className="table-responsive">
            <table className="table table-bordered align-middle mb-0">
              <thead><tr><th>Artist</th><th>Artist ID</th><th>Art Form</th><th>Role</th><th>Registration</th>{can("/group-members", "delete") && <th className="bk-col-view">Action</th>}</tr></thead>
              <tbody>
                {!data?.items.length ? <tr><td colSpan={6} className="text-center py-3 text-muted">No members added yet.</td></tr> : data.items.map((m) => (
                  <tr key={m.id}>
                    <td><div className="d-flex align-items-center gap-2"><span className="bk-avatar">{m.photo ? <img src={m.photo} alt="" /> : <i className="bi bi-person" aria-hidden="true" />}</span><div><b>{m.name}</b><small className="d-block text-muted">{m.location || "—"}</small></div></div></td>
                    <td className="small">{dash(m.regno)}</td>
                    <td className="small">{m.art_forms.join(", ") || "—"}</td>
                    <td>{m.member_role}</td>
                    <td><span className="badge bg-success"><i className="bi bi-check2 me-1" />Registered</span></td>
                    {can("/group-members", "delete") && <td><button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(m)}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ================================================================ registration card

type Card = {
  regno: string | null; name: string; holder: string; type: string; art_forms: string[]; location: string; photo: string | null;
  status: number; status_label: string; valid: boolean; issued_on: string; member_since: string; verify_url: string | null;
};

/** /artist/registration-card */
export function RegistrationCard() {
  const { data, error, loading } = useApiData<Card>("/artist/registration-card");
  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Digital Registration Card" />
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : data && (
        <>
          <div className="rc-wrap">
            <article className={`rc-card${data.valid ? "" : " pending"}`} aria-label="Opportunity Hub registration card">
              <header className="rc-head">
                <img src="/assets/console/emblem-white.png" alt="" width={34} height={42} />
                <div>
                  <small>Government of India · Ministry of Culture</small>
                  <b>Opportunity Hub</b>
                </div>
                <span className="rc-type">{data.type}</span>
              </header>
              <div className="rc-body">
                <span className="rc-photo">{data.photo ? <img src={data.photo} alt="" /> : <i className="bi bi-person" aria-hidden="true" />}</span>
                <dl>
                  <dt>Name</dt><dd className="rc-name">{data.name}</dd>
                  {data.holder !== data.name && (<><dt>Account Holder</dt><dd>{data.holder}</dd></>)}
                  <dt>Registration ID</dt><dd className="rc-id">{dash(data.regno)}</dd>
                  <dt>Art Form</dt><dd>{data.art_forms.join(", ") || "—"}</dd>
                  <dt>Location</dt><dd>{data.location || "—"}</dd>
                </dl>
              </div>
              <footer className="rc-foot">
                <span className={data.valid ? "rc-ok" : "rc-wait"}><i className={`bi ${data.valid ? "bi-patch-check-fill" : "bi-hourglass-split"}`} aria-hidden="true" /> {data.status_label}</span>
                <span>Issued {formatDate(data.issued_on)}</span>
              </footer>
            </article>
          </div>
          <div className="d-flex flex-wrap justify-content-center gap-2 mt-3 rc-actions">
            <button type="button" className="cms-btn rounded-2 py-2 px-3" onClick={() => window.print()}><i className="bi bi-printer me-1" />Print / Save as PDF</button>
            {data.verify_url && <a href={data.verify_url} target="_blank" rel="noopener noreferrer" className="border-btn rounded-2 py-2 px-3"><i className="bi bi-box-arrow-up-right me-1" />Public profile</a>}
          </div>
          {!data.valid && <p className="text-center text-muted small mt-2">The card becomes valid once your registration is verified by the Ministry / ZCC.</p>}
        </>
      )}
    </div>
  );
}
