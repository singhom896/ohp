"use client";

// Opportunities & bookings
//   Engagement Partner (role 11)          /partner/requirements[/create|/edit?id=|/view?id=]
//   Artist / Group / Organisation (5,6,7) /artist/opportunities[/view?id=], /artist/booking-requests,
//                                         /artist/performances, /artist/saved-opportunities, /artist/engagement-history
//   Admin (full) / ZCC (view)             /admin/bookings[/confirmed|/view?id=]
// A partner posts an opportunity. "Public" ones are emailed to approved artists
// whose art form / location / language fit; "invite only" ones reach only the
// artists the partner sends an engagement request to (Search Artists). Artists
// accept / decline; the partner confirms on call or by email, records the
// booking, marks it completed, gives feedback and adds event photos / videos.
// There is no payment on the platform. Backend: BookingService.
/* eslint-disable @next/next/no-img-element -- uploads are served by the Laravel host */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { http, toFormData } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import { dash, formatDate } from "../crud/common";
import { Pagination } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { confirmAction, confirmDelete, failure, promptText, success } from "../ui/alerts";
import { FileInput, SelectInput, TextArea, TextInput, toOptions, type Option } from "../ui/fields";

// ------------------------------------------------------------------ types

type ReqStatus = "draft" | "open" | "booked" | "closed" | "cancelled";
type IdName = { id: number; name: string };
export type Meta = { current_page: number; last_page: number; total: number; from: number | null; to: number | null };

export type Requirement = {
  id: number; reference: string; title: string; programme_type: string | null; status: ReqStatus; status_label: string; live: boolean;
  organisation: string; organisation_type: string | null; organisation_verified: boolean;
  art_form_id: number; sub_art_form_id: number | null; art_form: string | null; sub_art_form: string | null;
  artist_type: number | null; artist_type_label: string; language_id: number | null; language: string | null; performers_needed: number | null;
  event_date: string; event_end_date: string | null; event_time: string | null; end_time: string | null; duration: string | null; venue: string; city: string | null;
  state_id: number; district_id: number | null; state: string | null; district: string | null; match_scope: string; match_scope_label: string;
  visibility: "public" | "invite_only"; visibility_label: string | null;
  audience_size: string | null; budget: string | null; description: string; technical_requirements: string | null;
  artist_requirements: string | null; additional_instructions: string | null; respond_by: string | null;
  contact_name: string; contact_mobile: string; contact_email: string; published_at: string | null; closed_at: string | null;
  close_reason: string | null; created_at: string | null;
  stats?: { matched: number; notified: number; invited: number; interested: number; declined: number; booked: number };
};

export type MatchState = {
  match_id: number; source: "matched" | "invited"; invited: boolean; invited_at: string | null; invite_message: string | null;
  email_status: string; notified_at: string | null; interest: "pending" | "interested" | "not_available"; interest_label: string;
  interest_note: string | null; responded_at: string | null; booking_status: "confirmed" | "completed" | "cancelled" | null; booking_label: string | null;
  confirmed_via: string | null; confirmed_via_label: string | null; confirmed_on: string | null; agreed_fee: string | null;
  booking_remarks: string | null; booked_at: string | null; saved: boolean; rating: number | null; feedback: string | null; feedback_at: string | null;
};
type ArtistInfo = { id: number; name: string; type: string; regno: string | null; email: string | null; mobile: string | null; location: string; art_forms: string[]; photo: string | null; accredited?: boolean };
type MatchRow = ArtistInfo & MatchState;
export type Media = { id: number; type: "photo" | "video" | "youtube"; url: string; caption: string | null };

const REQ_BADGE: Record<ReqStatus, string> = {
  draft: "bg-secondary", open: "bg-success", booked: "bk-badge-booked", closed: "bg-dark", cancelled: "bg-danger",
};
export const INTEREST_BADGE: Record<string, string> = { pending: "bg-light text-muted border", interested: "bg-success", not_available: "bg-secondary" };
export const BOOKING_BADGE: Record<string, string> = { confirmed: "bk-badge-booked", completed: "bg-success", cancelled: "bg-danger" };

function ReqBadge({ r }: { r: Pick<Requirement, "status" | "status_label"> }) {
  return <span className={`badge ${REQ_BADGE[r.status] ?? "bg-secondary"}`}>{r.status_label}</span>;
}

export const dateRange = (r: Pick<Requirement, "event_date" | "event_end_date">) =>
  r.event_end_date && r.event_end_date !== r.event_date ? `${formatDate(r.event_date)} to ${formatDate(r.event_end_date)}` : formatDate(r.event_date);
const timeRange = (r: Pick<Requirement, "event_time" | "end_time">) => (r.event_time ? `${r.event_time}${r.end_time ? ` – ${r.end_time}` : ""}` : "");
const place = (r: Pick<Requirement, "venue" | "city"> & { district?: string | null; state?: string | null }) =>
  [r.venue, r.city, r.district, r.state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

export function Panel({ icon, title, action, children }: { icon: string; title: string; action?: React.ReactNode; children: React.ReactNode }) {
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

export function Kpi({ icon, label, value, tone }: { icon: string; label: string; value: number; tone?: "ok" | "bad" | "warn" }) {
  return (
    <div className={`ar-kpi${tone ? ` ${tone}` : ""}`}>
      <i className={`bi ${icon}`} aria-hidden="true" />
      <div><b>{value.toLocaleString("en-IN")}</b><small>{label}</small></div>
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="bk-stars" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={`bi ${n <= value ? "bi-star-fill" : "bi-star"}`} aria-hidden="true" />)}
    </span>
  );
}

/** All the opportunity fields, grouped. */
function RequirementDetails({ r, showContact = true }: { r: Requirement; showContact?: boolean }) {
  return (
    <>
      <Panel icon="bi-calendar-event" title="Event">
        <dl className="ar-dl">
          <div><dt>Event Date</dt><dd>{dateRange(r)}</dd></div>
          <div><dt>Time</dt><dd>{timeRange(r) || "—"}</dd></div>
          <div><dt>Event Category</dt><dd>{dash(r.programme_type)}</dd></div>
          <div><dt>Performance Duration</dt><dd>{dash(r.duration)}</dd></div>
          <div><dt>Venue</dt><dd>{place(r)}</dd></div>
          <div><dt>Audience Size</dt><dd>{dash(r.audience_size)}</dd></div>
          <div><dt>Honorarium / Budget</dt><dd>{dash(r.budget)}</dd></div>
          <div><dt>Last Date to Respond</dt><dd>{formatDate(r.respond_by)}</dd></div>
          <div><dt>Posted by</dt><dd>{r.organisation}{r.organisation_verified && <i className="bi bi-patch-check-fill text-success ms-1" title="Verified partner" aria-label="Verified partner" />}{r.organisation_type ? <small className="d-block text-muted">{r.organisation_type}</small> : null}</dd></div>
        </dl>
      </Panel>
      <Panel icon="bi-palette" title="Artist Requirement">
        <dl className="ar-dl">
          <div><dt>Art Form</dt><dd>{[r.art_form, r.sub_art_form].filter(Boolean).join(" – ") || "—"}</dd></div>
          <div><dt>Artist Type</dt><dd>{r.artist_type_label}</dd></div>
          <div><dt>Language</dt><dd>{r.language ?? "Any"}</dd></div>
          <div><dt>Number of Artists</dt><dd>{dash(r.performers_needed)}</dd></div>
          {r.visibility === "public" && <div><dt>Artists From</dt><dd>{r.match_scope === "india" ? "All India" : r.match_scope === "district" ? `${dash(r.district)} district` : dash(r.state)}</dd></div>}
        </dl>
        {r.artist_requirements && (<><h3 className="bk-subhead">Artist / Group Requirements</h3><p className="mb-0 bk-pre">{r.artist_requirements}</p></>)}
      </Panel>
      <Panel icon="bi-card-text" title="Description">
        <p className="mb-0 bk-pre">{r.description}</p>
        {r.technical_requirements && (<><h3 className="bk-subhead">Technical Requirements</h3><p className="mb-0 bk-pre">{r.technical_requirements}</p></>)}
        {r.additional_instructions && (<><h3 className="bk-subhead">Additional Instructions</h3><p className="mb-0 bk-pre">{r.additional_instructions}</p></>)}
      </Panel>
      {showContact && (
        <Panel icon="bi-telephone" title="Contact Person">
          <ContactCard name={r.contact_name} mobile={r.contact_mobile} email={r.contact_email} />
        </Panel>
      )}
    </>
  );
}

export function ContactCard({ name, mobile, email }: { name: string; mobile: string | null; email: string | null }) {
  return (
    <div className="bk-contact">
      <b>{name}</b>
      {mobile && <a href={`tel:+91${mobile}`}><i className="bi bi-telephone" aria-hidden="true" /> {mobile}</a>}
      {email && <a href={`mailto:${email}`}><i className="bi bi-envelope" aria-hidden="true" /> {email}</a>}
    </div>
  );
}

export function StatusTabs<K extends string>({ tabs, active, counts, onChange }: { tabs: [K, string][]; active: K; counts?: Partial<Record<K, number>>; onChange: (k: K) => void }) {
  return (
    <div className="ar-status-tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={active === k} className={active === k ? "active" : ""} onClick={() => onChange(k)}>
          {label}
          {counts && counts[k] !== undefined && <span className="ar-count">{counts[k]}</span>}
        </button>
      ))}
    </div>
  );
}

export function MediaGallery({ items, onDelete }: { items: Media[]; onDelete?: (m: Media) => void }) {
  if (!items.length) return <p className="text-muted small mb-0">No photos or videos yet.</p>;
  const youtubeId = (u: string) => u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,})/)?.[1];
  return (
    <div className="bk-media-grid">
      {items.map((m) => (
        <figure key={m.id} className="bk-media">
          {m.type === "photo" ? (
            <a href={m.url} target="_blank" rel="noopener noreferrer"><img src={m.url} alt={m.caption ?? "Event photo"} loading="lazy" /></a>
          ) : m.type === "video" ? (
            <video src={m.url} controls preload="metadata" />
          ) : youtubeId(m.url) ? (
            <iframe src={`https://www.youtube-nocookie.com/embed/${youtubeId(m.url)}`} title={m.caption ?? "Event video"} loading="lazy" allowFullScreen />
          ) : (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="bk-media-link"><i className="bi bi-youtube" aria-hidden="true" /> Watch video</a>
          )}
          <figcaption>
            <span>{m.caption ?? (m.type === "photo" ? "Photo" : "Video")}</span>
            {onDelete && (
              <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => onDelete(m)} aria-label="Remove media"><i className="bi bi-trash" /></button>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

// ------------------------------------------------ linked artists table

function MatchTable({ rows, mode, live, onBook, onUpdate, onFeedback }: {
  rows: MatchRow[]; mode: "partner" | "admin"; live: boolean;
  onBook?: (m: MatchRow) => void; onUpdate?: (m: MatchRow, status: "completed" | "cancelled") => void; onFeedback?: (m: MatchRow) => void;
}) {
  const [filter, setFilter] = useState<"all" | "invited" | "interested" | "booked">("all");
  const shown = rows.filter((m) => (filter === "invited" ? m.invited : filter === "interested" ? m.interest === "interested" : filter === "booked" ? !!m.booking_status : true));
  const counts = {
    all: rows.length, invited: rows.filter((m) => m.invited).length,
    interested: rows.filter((m) => m.interest === "interested").length, booked: rows.filter((m) => m.booking_status).length,
  };

  return (
    <>
      <div className="mb-2">
        <StatusTabs tabs={[["all", "All"], ["invited", "Requests Sent"], ["interested", "Accepted / Interested"], ["booked", "Bookings"]]} active={filter} counts={counts} onChange={setFilter} />
      </div>
      {!rows.length ? (
        <p className="text-muted mb-0">No artists yet. {mode === "partner" && "Publish the opportunity to notify matching artists, or send engagement requests from Search Artists."}</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-bordered align-middle bk-match-table">
            <thead>
              <tr>
                <th>Artist</th>
                <th>Art Form / Location</th>
                <th>Contact</th>
                <th>Response</th>
                <th>Booking</th>
                {mode === "partner" && <th className="bk-col-action">Action</th>}
              </tr>
            </thead>
            <tbody>
              {!shown.length ? (
                <tr><td colSpan={6} className="text-center py-3 text-muted">Nothing here yet.</td></tr>
              ) : shown.map((m) => (
                <tr key={m.match_id} className={m.booking_status === "confirmed" ? "bk-row-booked" : ""}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span className="bk-avatar">{m.photo ? <img src={m.photo} alt="" /> : <i className="bi bi-person" aria-hidden="true" />}</span>
                      <div className="min-w-0">
                        <b className="d-block">{mode === "partner" ? <Link href={`/partner/find-artists/view?id=${m.id}`}>{m.name}</Link> : m.name}</b>
                        <small className="text-muted">{m.type}{m.regno ? ` · ${m.regno}` : ""}</small>
                        <small className="d-block">{m.invited ? <span className="badge bg-info text-dark">Request sent {formatDate(m.invited_at)}</span> : <span className="badge bg-light text-muted border">Matched</span>}</small>
                      </div>
                    </div>
                  </td>
                  <td className="small">{m.art_forms.join(", ") || "—"}<br /><span className="text-muted">{m.location || "—"}</span></td>
                  <td className="small text-nowrap">
                    {m.mobile && <a href={`tel:+91${m.mobile}`} className="d-block"><i className="bi bi-telephone me-1" />{m.mobile}</a>}
                    {m.email && <a href={`mailto:${m.email}`} className="d-block text-break"><i className="bi bi-envelope me-1" />{m.email}</a>}
                    {!m.mobile && !m.email && <small className="d-block text-muted">Shared once the artist accepts</small>}
                    <small className="text-muted">{m.email_status === "sent" ? `Emailed ${formatDate(m.notified_at)}` : m.email_status === "failed" ? "Email failed" : "Email pending"}</small>
                  </td>
                  <td>
                    <span className={`badge ${INTEREST_BADGE[m.interest] ?? "bg-secondary"}`}>{m.interest_label}</span>
                    {m.interest_note && <small className="d-block text-muted mt-1">“{m.interest_note}”</small>}
                  </td>
                  <td className="small">
                    {m.booking_status ? (
                      <>
                        <span className={`badge ${BOOKING_BADGE[m.booking_status] ?? "bg-secondary"}`}>{m.booking_label}</span>
                        {m.confirmed_via_label && <span className="d-block mt-1">via {m.confirmed_via_label} on {formatDate(m.confirmed_on)}</span>}
                        {m.agreed_fee && <span className="d-block">Agreed: {m.agreed_fee}</span>}
                        {m.booking_remarks && <span className="d-block text-muted">{m.booking_remarks}</span>}
                        {m.rating && <span className="d-block mt-1"><Stars value={m.rating} /></span>}
                      </>
                    ) : "—"}
                  </td>
                  {mode === "partner" && (
                    <td className="text-nowrap">
                      {live && m.interest === "interested" && (!m.booking_status || m.booking_status === "cancelled") && (
                        <button type="button" className="btn btn-sm btn-success" onClick={() => onBook?.(m)}>
                          <i className="bi bi-check2-circle me-1" />Record Booking
                        </button>
                      )}
                      {live && m.interest !== "interested" && !m.booking_status && <small className="text-muted">Awaiting acceptance</small>}
                      {m.booking_status === "confirmed" && (
                        <div className="d-flex gap-1">
                          <button type="button" className="btn btn-sm btn-outline-success" title="Mark as completed" aria-label="Mark as completed" onClick={() => onUpdate?.(m, "completed")}>
                            <i className="bi bi-flag" />
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-danger" title="Cancel booking" aria-label="Cancel booking" onClick={() => onUpdate?.(m, "cancelled")}>
                            <i className="bi bi-x-circle" />
                          </button>
                        </div>
                      )}
                      {m.booking_status === "completed" && (
                        <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => onFeedback?.(m)}>
                          <i className="bi bi-star me-1" />{m.rating ? "Edit Feedback" : "Give Feedback"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Dialog({ title, icon, busy, onClose, onSubmit, submitLabel, children }: {
  title: string; icon: string; busy: boolean; onClose: () => void; onSubmit: (e: React.FormEvent) => void; submitLabel: string; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <>
      <div className="modal d-block" role="dialog" aria-modal="true" aria-labelledby="bk-dialog-title" tabIndex={-1}>
        <div className="modal-dialog modal-dialog-centered">
          <form className="modal-content bk-dialog" onSubmit={onSubmit} noValidate>
            <div className="modal-header">
              <h2 className="modal-title h5" id="bk-dialog-title"><i className={`bi ${icon} me-2`} />{title}</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} disabled={busy} />
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">
              <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="cms-btn rounded-2 py-2 px-3" disabled={busy}>
                {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}{submitLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}

/** Record a booking that was confirmed on call or by email. */
function BookingDialog({ match, requirementId, onClose, onSaved }: { match: MatchRow; requirementId: number; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ confirmed_via: "call", confirmed_on: today, agreed_fee: "", remarks: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await http.post(`/partner/requirements/${requirementId}/matches/${match.match_id}/booking`, f);
      await success(res.message, "Booking recorded");
      onSaved();
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) setErrors(ex.errors);
      else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Record Booking" icon="bi-check2-circle" busy={busy} onClose={onClose} onSubmit={save} submitLabel="Confirm Booking">
      <p className="mb-3">Booking <b>{match.name}</b> ({match.type}). Record it once you have confirmed the programme with the artist on call or by email; the artist is informed.</p>
      <fieldset className="mb-3">
        <legend className="form-label fw-bold mb-2">Confirmed via <sup className="text-danger">*</sup></legend>
        <div className="ap-radios">
          {[["call", "Phone call", "bi-telephone"], ["email", "Email", "bi-envelope"]].map(([v, l, icon]) => (
            <label key={v} className={`ap-chip${f.confirmed_via === v ? " on" : ""}`}>
              <input type="radio" name="confirmed_via" value={v} checked={f.confirmed_via === v} onChange={() => setF({ ...f, confirmed_via: v })} />
              <i className={`bi ${icon}`} aria-hidden="true" /> {l}
            </label>
          ))}
        </div>
        {errors.confirmed_via && <small className="text-danger d-block">{errors.confirmed_via[0]}</small>}
      </fieldset>
      <div className="row g-3">
        <div className="col-md-6">
          <TextInput name="confirmed_on" label="Confirmed On" type="date" required max={today} value={f.confirmed_on} onChange={(v) => setF({ ...f, confirmed_on: v })} error={errors.confirmed_on?.[0]} />
        </div>
        <div className="col-md-6">
          <TextInput name="agreed_fee" label="Agreed Honorarium (note)" placeholder="e.g. Rs 25,000 + travel" maxLength={100} value={f.agreed_fee} onChange={(v) => setF({ ...f, agreed_fee: v })}
            error={errors.agreed_fee?.[0]} help="For your records only. No payment is made through Opportunity Hub." />
        </div>
        <div className="col-12">
          <TextArea name="remarks" label="Remarks" rows={2} maxLength={2000} value={f.remarks} onChange={(v) => setF({ ...f, remarks: v })} error={errors.remarks?.[0]} />
        </div>
      </div>
      {errors.booking && <div className="alert alert-danger mt-3 mb-0">{errors.booking[0]}</div>}
    </Dialog>
  );
}

/** Partner feedback on a completed performance. */
function FeedbackDialog({ match, requirementId, onClose, onSaved }: { match: MatchRow; requirementId: number; onClose: () => void; onSaved: () => void }) {
  const [rating, setRating] = useState(match.rating ?? 0);
  const [text, setText] = useState(match.feedback ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await http.post(`/partner/requirements/${requirementId}/matches/${match.match_id}/feedback`, { rating, feedback: text || null });
      await success(res.message, "Feedback saved");
      onSaved();
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) setErrors(ex.errors);
      else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Performance Feedback" icon="bi-star" busy={busy} onClose={onClose} onSubmit={save} submitLabel="Save Feedback">
      <p className="mb-2">How was the performance of <b>{match.name}</b>? The artist sees your rating and feedback in their engagement history.</p>
      <fieldset className="mb-3">
        <legend className="form-label fw-bold mb-1">Rating <sup className="text-danger">*</sup></legend>
        <div className="bk-rate" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className={n <= rating ? "on" : ""}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
              <i className={`bi ${n <= rating ? "bi-star-fill" : "bi-star"}`} aria-hidden="true" />
              <span className="visually-hidden">{n} star{n > 1 ? "s" : ""}</span>
            </label>
          ))}
        </div>
        {errors.rating && <small className="text-danger d-block">{errors.rating[0]}</small>}
      </fieldset>
      <TextArea name="feedback" label="Feedback" rows={3} maxLength={2000} value={text} onChange={setText} error={errors.feedback?.[0]} />
    </Dialog>
  );
}

/** Event photos / videos for a published opportunity (partner). */
function MediaPanel({ requirementId, items, onChange }: { requirementId: number; items: Media[]; onChange: (m: Media[]) => void }) {
  const [type, setType] = useState<"photo" | "video" | "youtube">("photo");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await http.post<Media[]>(`/partner/requirements/${requirementId}/media`, toFormData({
        media_type: type, file: type === "youtube" ? undefined : file ?? undefined, url: type === "youtube" ? url : undefined, caption: caption || undefined,
      }));
      onChange(res.data);
      setFile(null); setUrl(""); setCaption(""); setInputKey((k) => k + 1);
      await success(res.message);
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) setErrors(ex.errors);
      else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: Media) {
    if (!(await confirmDelete(m.caption ? `"${m.caption}"` : "this media"))) return;
    try {
      const res = await http.delete<Media[]>(`/partner/requirements/${requirementId}/media/${m.id}`);
      onChange(res.data);
    } catch (e) {
      await failure(e);
    }
  }

  return (
    <Panel icon="bi-images" title="Event Photos & Videos">
      <MediaGallery items={items} onDelete={remove} />
      <form className="row g-2 align-items-end mt-2" onSubmit={upload} noValidate>
        <div className="col-md-3">
          <SelectInput name="media_type" label="Type" value={type} onChange={(v) => setType(v as typeof type)}
            options={[{ value: "photo", label: "Photo (max 5 MB)" }, { value: "video", label: "Video MP4 (max 50 MB)" }, { value: "youtube", label: "YouTube link" }]} />
        </div>
        <div className="col-md-4">
          {type === "youtube" ? (
            <TextInput name="media_url" label="YouTube Link" type="url" placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={setUrl} error={errors.url?.[0]} />
          ) : (
            <FileInput key={inputKey} name="media_file" label={type === "photo" ? "Photo" : "Video"} accept={type === "photo" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm"}
              onChange={(fs) => setFile(fs[0] ?? null)} error={errors.file?.[0]} />
          )}
        </div>
        <div className="col-md-3"><TextInput name="media_caption" label="Caption" maxLength={255} value={caption} onChange={setCaption} error={errors.caption?.[0]} /></div>
        <div className="col-md-2">
          <button type="submit" className="cms-btn rounded-2 py-2 px-3 w-100" disabled={busy || (type === "youtube" ? !url : !file)}>
            {busy ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <><i className="bi bi-upload me-1" />Add</>}
          </button>
        </div>
      </form>
    </Panel>
  );
}

// ======================================================= engagement partner

type PartnerList = { items: Requirement[]; meta: Meta; counts: Record<ReqStatus, number>; can_post: boolean };
const PARTNER_TABS: [string, string][] = [["", "All"], ["open", "Open"], ["booked", "Booked"], ["draft", "Drafts"], ["closed", "Closed"], ["cancelled", "Cancelled"]];

function ProfileNeeded() {
  return (
    <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2">
      <i className="bi bi-info-circle" aria-hidden="true" />
      <span className="flex-grow-1">Complete your Organisation Profile to post opportunities and send engagement requests.</span>
      <Link href="/partner/partner-profile" className="cms-btn rounded-2 py-1 px-3">Complete Profile</Link>
    </div>
  );
}

/** /partner/requirements */
export function RequirementList() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams(Object.entries({ status, search: applied, page: String(page) }).filter(([, v]) => v));
  const { data, error, loading, reload } = useApiData<PartnerList>(`/partner/requirements?${qs}`);
  const counts = data ? { "": Object.values(data.counts).reduce((a, b) => a + b, 0), ...data.counts } : undefined;

  async function remove(r: Requirement) {
    if (!(await confirmDelete(`draft "${r.title}"`))) return;
    try {
      const res = await http.delete(`/partner/requirements/${r.id}`);
      await success(res.message, "Deleted!");
      reload();
    } catch (e) {
      await failure(e);
    }
  }

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="My Opportunities" />
      {data && !data.can_post && <ProfileNeeded />}
      <div className="bk-intro">
        <i className="bi bi-megaphone" aria-hidden="true" />
        <div className="flex-grow-1">
          <b>Need artists for an event?</b>
          <p>Post an opportunity. Public opportunities are emailed to approved artists, groups and institutes whose art form and location fit; invite-only ones reach only the artists you send engagement requests to. Track responses, confirm bookings on call or email and keep the event record here.</p>
        </div>
        {data?.can_post && (
          <Link href="/partner/requirements/create" className="cms-btn rounded-2 py-2 px-3 text-nowrap"><i className="bi bi-plus-lg me-1" />Post Opportunity</Link>
        )}
      </div>

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <StatusTabs tabs={PARTNER_TABS} active={status} counts={counts} onChange={(k) => { setStatus(k); setPage(1); }} />
        <form className="d-flex gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); setPage(1); }}>
          <input type="search" className="form-control" placeholder="Title or reference" aria-label="Search opportunities" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit" className="theme-btn rounded-2 px-3">Search</button>
        </form>
      </div>

      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead>
                <tr>
                  <th>Opportunity</th>
                  <th>Event Date</th>
                  <th>Art Form</th>
                  <th>Artists / Accepted / Booked</th>
                  <th>Status</th>
                  <th className="bk-col-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {!data?.items.length ? (
                  <tr><td colSpan={6} className="text-center py-4">No opportunities yet.</td></tr>
                ) : data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.title}</b>
                      <small className="d-block text-muted">{r.reference} · {place(r)}</small>
                      {r.visibility === "invite_only" && <span className="badge bg-info text-dark mt-1">Invite only</span>}
                    </td>
                    <td className="small">{dateRange(r)}</td>
                    <td className="small">{[r.art_form, r.sub_art_form].filter(Boolean).join(" – ")}</td>
                    <td>{r.status === "draft" ? <span className="text-muted small">Not published</span> : <span className="bk-stats">{r.stats?.matched ?? 0} / <b className="text-success">{r.stats?.interested ?? 0}</b> / <b>{r.stats?.booked ?? 0}</b></span>}</td>
                    <td><ReqBadge r={r} /></td>
                    <td className="text-nowrap">
                      <Link href={`/partner/requirements/view?id=${r.id}`} className="btn btn-sm btn-outline-info me-1" title="View" aria-label="View opportunity"><i className="bi bi-eye" /></Link>
                      {(r.status === "draft" || r.live) && (
                        <Link href={`/partner/requirements/edit?id=${r.id}`} className="btn btn-sm btn-outline-primary me-1" title="Edit" aria-label="Edit opportunity"><i className="bi bi-pencil-square" /></Link>
                      )}
                      {r.status === "draft" && (
                        <button type="button" className="btn btn-sm btn-outline-danger" title="Delete draft" aria-label="Delete draft" onClick={() => remove(r)}><i className="bi bi-trash" /></button>
                      )}
                    </td>
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

type Options = {
  art_forms: IdName[]; sub_art_forms: (IdName & { parent_id: number })[]; states: IdName[]; districts: (IdName & { state_id: number })[];
  languages: IdName[]; programme_types: string[]; audience_sizes: string[]; artist_types: Option[]; scopes: Option[]; visibility: Option[];
};
type OptionsData = { options: Options; defaults: Record<string, string>; can_post: boolean };

const EMPTY_FORM = {
  title: "", programme_type: "", art_form_id: "", sub_art_form_id: "", artist_type: "", language_id: "", performers_needed: "",
  event_date: "", event_end_date: "", event_time: "", end_time: "", duration: "", venue: "", city: "", state_id: "", district_id: "",
  match_scope: "state", visibility: "public", audience_size: "", budget: "", description: "", technical_requirements: "",
  artist_requirements: "", additional_instructions: "", respond_by: "", contact_name: "", contact_mobile: "", contact_email: "",
};
type FormState = typeof EMPTY_FORM;

function fromRequirement(r: Requirement): FormState {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, s((r as unknown as Record<string, unknown>)[k])])) as FormState;
}

/** /partner/requirements/create and /partner/requirements/edit?id= */
export function RequirementForm() {
  const id = useSearchParams().get("id");
  const opts = useApiData<OptionsData>("/partner/requirements/options");
  const existing = useApiData<{ requirement: Requirement; editable: boolean }>(id ? `/partner/requirements/${encodeURIComponent(id)}` : null);

  if (opts.loading || (id && existing.loading)) return <Loader />;
  const err = opts.error ?? existing.error;
  if (err || !opts.data || (id && !existing.data)) {
    return <div className="container-fluid"><PageHeader title="Opportunity" backHref="/partner/requirements" /><ErrorBox message={err ?? "Unable to load the form."} /></div>;
  }
  if (id && existing.data && !existing.data.editable) {
    return <div className="container-fluid"><PageHeader title="Edit Opportunity" backHref="/partner/requirements" /><ErrorBox message="This opportunity is closed, cancelled or its event date has passed, so it can no longer be edited." /></div>;
  }
  if (!id && !opts.data.can_post) {
    return <div className="container-fluid"><PageHeader title="Post Opportunity" backHref="/partner/requirements" /><ProfileNeeded /></div>;
  }
  return <RequirementFormBody options={opts.data.options} defaults={opts.data.defaults} existing={existing.data?.requirement ?? null} />;
}

function RequirementFormBody({ options: o, defaults, existing }: { options: Options; defaults: Record<string, string>; existing: Requirement | null }) {
  const router = useRouter();
  const initial = useMemo<FormState>(() => (existing ? fromRequirement(existing) : { ...EMPTY_FORM, ...defaults }), [existing, defaults]);
  const [f, setF] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const isDraft = !existing || existing.status === "draft";
  const isPublic = f.visibility === "public";
  const set = (k: keyof FormState) => (v: string) => setF((c) => ({ ...c, [k]: v }));
  const err = (k: string) => errors[k]?.[0];
  const today = new Date().toISOString().slice(0, 10);

  const subs = o.sub_art_forms.filter((s) => String(s.parent_id) === f.art_form_id);
  const districts = o.districts.filter((d) => String(d.state_id) === f.state_id);
  const individualsOnly = f.artist_type === "5";

  // Live "N artists match" preview (public opportunities).
  const criteria = useMemo(() => {
    if (!isPublic || !f.art_form_id || (f.match_scope !== "india" && !f.state_id) || (f.match_scope === "district" && !f.district_id)) return null;
    return new URLSearchParams(Object.entries({
      art_form_id: f.art_form_id, sub_art_form_id: individualsOnly ? f.sub_art_form_id : "", artist_type: f.artist_type,
      language_id: f.language_id, match_scope: f.match_scope, state_id: f.state_id, district_id: f.district_id,
    }).filter(([, v]) => v)).toString();
  }, [isPublic, f.art_form_id, f.sub_art_form_id, f.artist_type, f.language_id, f.match_scope, f.state_id, f.district_id, individualsOnly]);

  useEffect(() => {
    let off = false;
    const t = window.setTimeout(async () => {
      if (!criteria) { setCount(null); return; }
      try {
        const res = await http.get<{ count: number }>(`/partner/requirements/match-count?${criteria}`);
        if (!off) setCount(res.data.count);
      } catch {
        if (!off) setCount(null);
      }
    }, 400);
    return () => { off = true; window.clearTimeout(t); };
  }, [criteria]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value === "draft" ? "draft" : "publish";
    if (action === "publish" && isDraft) {
      const ok = await confirmAction("Publish this opportunity?", isPublic
        ? `${count ?? "Matching"} artist(s) will be emailed about it. You can still edit it afterwards; newly matching artists are emailed too.`
        : "It will be visible only to the artists you send engagement requests to (from Search Artists or Shortlisted Artists).", "Yes, publish");
      if (!ok) return;
    }
    setBusy(true);
    setErrors({});
    const body = { ...f, sub_art_form_id: individualsOnly ? f.sub_art_form_id : "", action };
    try {
      const res = existing
        ? await http.put<Requirement>(`/partner/requirements/${existing.id}`, body)
        : await http.post<Requirement>("/partner/requirements", body);
      await success(res.message, action === "draft" ? "Saved" : "Published!");
      router.push(`/partner/requirements/view?id=${res.data.id}`);
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) {
        setErrors(ex.errors);
        window.setTimeout(() => document.querySelector(".bk-form .text-danger, .bk-form .is-invalid")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      } else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  const strings = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

  return (
    <div className="container-fluid ap-page">
      <PageHeader title={existing ? `Edit Opportunity ${existing.reference}` : "Post an Opportunity"} backHref={existing ? `/partner/requirements/view?id=${existing.id}` : "/partner/requirements"} />
      {existing && !isDraft && (
        <div className="alert alert-light border"><i className="bi bi-info-circle me-2" />This opportunity is published. {isPublic ? "Saving re-checks the matching; artists who newly match are emailed." : "Invited artists stay on the list."}</div>
      )}
      <form className="form-box ap-form bk-form" noValidate onSubmit={save}>
        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-calendar-event" aria-hidden="true" /><div><h2>Event Details</h2></div></header>
          <div className="row g-3">
            <div className="col-lg-8"><TextInput name="title" label="Event / Opportunity Title" icon="bi-megaphone" required maxLength={200} placeholder="e.g. Folk evening for hotel guests" value={f.title} onChange={set("title")} error={err("title")} /></div>
            <div className="col-lg-4"><SelectInput name="programme_type" label="Event Category" icon="bi-tags" required value={f.programme_type} onChange={set("programme_type")} options={strings(o.programme_types)} placeholder="Select" error={err("programme_type")} /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="event_date" label="Event Date" type="date" icon="bi-calendar" required min={today} value={f.event_date} onChange={set("event_date")} error={err("event_date")} /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="event_end_date" label="End Date" type="date" icon="bi-calendar-range" min={f.event_date || today} value={f.event_end_date} onChange={set("event_end_date")} error={err("event_end_date")} help="For multi-day events." /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="event_time" label="Start Time" type="time" icon="bi-clock" required value={f.event_time} onChange={set("event_time")} error={err("event_time")} /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="end_time" label="End Time" type="time" icon="bi-clock-history" value={f.end_time} onChange={set("end_time")} error={err("end_time")} /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="duration" label="Performance Duration" icon="bi-hourglass-split" maxLength={100} placeholder="e.g. 45 minutes" value={f.duration} onChange={set("duration")} error={err("duration")} /></div>
            <div className="col-lg-3 col-md-6"><SelectInput name="audience_size" label="Expected Audience" icon="bi-people" value={f.audience_size} onChange={set("audience_size")} options={strings(o.audience_sizes)} placeholder="Select" error={err("audience_size")} /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="budget" label="Honorarium Offered" icon="bi-currency-rupee" maxLength={150} placeholder="e.g. Rs 25,000 + travel" value={f.budget} onChange={set("budget")} error={err("budget")} help="Settled directly with the artist." /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="respond_by" label="Last Date to Respond" type="date" icon="bi-calendar-check" min={today} max={f.event_date || undefined} value={f.respond_by} onChange={set("respond_by")} error={err("respond_by")} /></div>
          </div>
        </section>

        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-geo-alt" aria-hidden="true" /><div><h2>Venue</h2></div></header>
          <div className="row g-3">
            <div className="col-lg-6"><TextInput name="venue" label="Venue" icon="bi-building" required maxLength={255} value={f.venue} onChange={set("venue")} error={err("venue")} /></div>
            <div className="col-lg-6"><TextInput name="city" label="City / Town" icon="bi-buildings" required maxLength={100} value={f.city} onChange={set("city")} error={err("city")} /></div>
            <div className="col-lg-6 col-md-6">
              <SelectInput name="state_id" label="State / UT" icon="bi-map" required value={f.state_id} onChange={(v) => setF((c) => ({ ...c, state_id: v, district_id: "" }))} options={toOptions(o.states)} placeholder="Select State / UT" error={err("state_id")} />
            </div>
            <div className="col-lg-6 col-md-6">
              <SelectInput name="district_id" label="District" icon="bi-geo" required={isPublic && f.match_scope === "district"} value={f.district_id} onChange={set("district_id")} options={toOptions(districts)}
                placeholder={f.state_id ? "Select district" : "Select State / UT first"} disabled={!f.state_id} error={err("district_id")} />
            </div>
          </div>
        </section>

        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-palette" aria-hidden="true" /><div><h2>Artist Requirement</h2><p>Only approved Artist / Group accounts are notified or can be invited.</p></div></header>
          <div className="row g-3">
            <div className="col-lg-4 col-md-6">
              <SelectInput name="art_form_id" label="Art Form Required" icon="bi-grid" required value={f.art_form_id} onChange={(v) => setF((c) => ({ ...c, art_form_id: v, sub_art_form_id: "" }))}
                options={toOptions(o.art_forms)} placeholder="Select art form" error={err("art_form_id")} />
            </div>
            <div className="col-lg-4 col-md-6">
              <SelectInput name="artist_type" label="Artist Type" icon="bi-person-badge" value={f.artist_type} onChange={set("artist_type")} options={o.artist_types} placeholder="Any – artist, group or institute" error={err("artist_type")} />
            </div>
            <div className="col-lg-4 col-md-6">
              <SelectInput name="sub_art_form_id" label="Specialisation" icon="bi-music-note-beamed" value={f.sub_art_form_id} onChange={set("sub_art_form_id")}
                options={toOptions(subs)} placeholder={f.art_form_id ? "Any" : "Select art form first"} disabled={!f.art_form_id || !subs.length || !individualsOnly}
                error={err("sub_art_form_id")} help={individualsOnly ? "Optional: narrows individual artists." : "Choose Individual Artist to filter by specialisation."} />
            </div>
            <div className="col-lg-4 col-md-6">
              <SelectInput name="language_id" label="Performance Language" icon="bi-translate" value={f.language_id} onChange={set("language_id")} options={toOptions(o.languages)} placeholder="Any language" error={err("language_id")} />
            </div>
            <div className="col-lg-4 col-md-6">
              <TextInput name="performers_needed" label="Number of Artists Required" icon="bi-person-plus" inputMode="numeric" value={f.performers_needed}
                onChange={(v) => set("performers_needed")(v.replace(/\D/g, "").slice(0, 3))} error={err("performers_needed")} />
            </div>
            <div className="col-12"><TextArea name="artist_requirements" label="Artist / Group Requirements" rows={3} maxLength={3000} placeholder="Experience, team size, costumes, instruments…" value={f.artist_requirements} onChange={set("artist_requirements")} error={err("artist_requirements")} /></div>
          </div>
        </section>

        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-broadcast" aria-hidden="true" /><div><h2>Who Should See It</h2></div></header>
          <div className="row g-3">
            <div className="col-12">
              <div className="ap-radios" role="radiogroup" aria-label="Visibility">
                {o.visibility.map((s) => (
                  <label key={String(s.value)} className={`ap-chip${f.visibility === s.value ? " on" : ""}`}>
                    <input type="radio" name="visibility" value={String(s.value)} checked={f.visibility === s.value} onChange={() => set("visibility")(String(s.value))} />
                    {s.label}
                  </label>
                ))}
              </div>
              {err("visibility") && <small className="text-danger d-block">{err("visibility")}</small>}
            </div>
            {isPublic ? (
              <>
                <div className="col-12">
                  <span className="form-label fw-bold mb-2 d-block">Notify Artists From <sup className="text-danger">*</sup></span>
                  <div className="ap-radios" role="radiogroup" aria-label="Notify artists from">
                    {o.scopes.map((s) => (
                      <label key={String(s.value)} className={`ap-chip${f.match_scope === s.value ? " on" : ""}`}>
                        <input type="radio" name="match_scope" value={String(s.value)} checked={f.match_scope === s.value} onChange={() => set("match_scope")(String(s.value))} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                  {err("match_scope") && <small className="text-danger d-block">{err("match_scope")}</small>}
                </div>
                <div className="col-12">
                  <div className={`bk-match-preview${count === 0 ? " none" : ""}`} aria-live="polite">
                    <i className="bi bi-people-fill" aria-hidden="true" />
                    {criteria === null ? "Choose the art form and location to see how many artists match." : count === null ? "Checking matching artists…" : count === 0
                      ? "No approved artists match these criteria yet. Try a wider location or fewer filters, or make it invite only."
                      : <><b>{count}</b>&nbsp;approved artist{count === 1 ? "" : "s"} match{count === 1 ? "es" : ""} and will be emailed when you publish.</>}
                  </div>
                </div>
              </>
            ) : (
              <div className="col-12">
                <div className="bk-match-preview" aria-live="polite">
                  <i className="bi bi-send-check" aria-hidden="true" />
                  After publishing, open <b className="mx-1">Search Artists</b> or <b className="mx-1">Shortlisted Artists</b> and send engagement requests to the artists you choose.
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-card-text" aria-hidden="true" /><div><h2>Description &amp; Instructions</h2></div></header>
          <div className="row g-3">
            <div className="col-12"><TextArea name="description" label="Event Description" required rows={5} maxLength={5000} value={f.description} onChange={set("description")} error={err("description")} /></div>
            <div className="col-lg-6"><TextArea name="technical_requirements" label="Technical Requirements" rows={3} maxLength={3000} placeholder="Stage size, sound, lighting…" value={f.technical_requirements} onChange={set("technical_requirements")} error={err("technical_requirements")} /></div>
            <div className="col-lg-6"><TextArea name="additional_instructions" label="Additional Instructions" rows={3} maxLength={3000} placeholder="Reporting time, dress code, travel and stay…" value={f.additional_instructions} onChange={set("additional_instructions")} error={err("additional_instructions")} /></div>
          </div>
        </section>

        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-telephone" aria-hidden="true" /><div><h2>Contact Details</h2><p>Shown to the artists who receive this opportunity.</p></div></header>
          <div className="row g-3">
            <div className="col-lg-4"><TextInput name="contact_name" label="Contact Person" icon="bi-person" required maxLength={150} value={f.contact_name} onChange={set("contact_name")} error={err("contact_name")} /></div>
            <div className="col-lg-4"><TextInput name="contact_mobile" label="Mobile" icon="bi-phone" required inputMode="numeric" maxLength={10} value={f.contact_mobile} onChange={(v) => set("contact_mobile")(v.replace(/\D/g, "").slice(0, 10))} error={err("contact_mobile")} /></div>
            <div className="col-lg-4"><TextInput name="contact_email" label="Email" icon="bi-envelope" type="email" required maxLength={191} value={f.contact_email} onChange={set("contact_email")} error={err("contact_email")} /></div>
          </div>
        </section>

        <div className="ap-actions">
          <button type="button" className="border-btn rounded-2" disabled={busy} onClick={() => { setF(initial); setErrors({}); }}>Reset</button>
          {isDraft && <button type="submit" value="draft" className="border-btn rounded-2" disabled={busy}><i className="bi bi-save me-2" />Save Draft</button>}
          <button type="submit" value="publish" className="cms-btn rounded-2" disabled={busy}>
            {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : <i className={`bi ${isDraft ? "bi-send" : "bi-check2"} me-2`} />}
            {isDraft ? (isPublic ? "Publish & Notify Artists" : "Publish") : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** /partner/requirements/view?id= */
export function RequirementView() {
  const id = useSearchParams().get("id");
  const { data, error, loading, reload, setData } = useApiData<{ requirement: Requirement; matches: MatchRow[]; media: Media[]; editable: boolean }>(id ? `/partner/requirements/${encodeURIComponent(id)}` : null);
  const [booking, setBooking] = useState<MatchRow | null>(null);
  const [feedback, setFeedback] = useState<MatchRow | null>(null);

  async function status(action: "close" | "cancel" | "reopen") {
    if (!data) return;
    let reason: string | null = null;
    if (action === "cancel") {
      reason = await promptText("Cancel this opportunity?", "Reason (sent to booked artists)", true);
      if (reason === null) return;
    } else if (action === "close") {
      reason = await promptText("Close this opportunity?", "Optional note (e.g. all slots filled)", false);
      if (reason === null) return;
    } else if (!(await confirmAction("Reopen this opportunity?", "Artists will be able to respond again.", "Yes, reopen"))) return;
    try {
      const res = await http.post(`/partner/requirements/${data.requirement.id}/status`, { action, reason: reason || null });
      await success(res.message);
      reload();
    } catch (e) {
      await failure(e);
    }
  }

  async function updateBooking(m: MatchRow, s: "completed" | "cancelled") {
    if (!data) return;
    let remarks: string | null = null;
    if (s === "cancelled") {
      remarks = await promptText(`Cancel booking of ${m.name}?`, "Reason (sent to the artist)", true);
      if (remarks === null) return;
    } else if (!(await confirmAction("Mark as completed?", `${m.name} performed at the event.`, "Yes, completed"))) return;
    try {
      const res = await http.patch(`/partner/requirements/${data.requirement.id}/matches/${m.match_id}/booking`, { status: s, remarks });
      await success(res.message);
      reload();
    } catch (e) {
      await failure(e);
    }
  }

  if (!id) return <div className="container-fluid"><PageHeader title="Opportunity" backHref="/partner/requirements" /><ErrorBox message="No opportunity selected." /></div>;
  const r = data?.requirement;
  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Opportunity" backHref="/partner/requirements" />
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : r && data && (
        <>
          <section className="oh-card ar-hero compact">
            <div className="flex-grow-1 min-w-0">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <h2 className="ar-hero-name">{r.title}</h2>
                <ReqBadge r={r} />
                {r.visibility === "invite_only" && <span className="badge bg-info text-dark">Invite only</span>}
              </div>
              <div className="ar-hero-meta">
                <span><i className="bi bi-hash" /> {r.reference}</span>
                <span><i className="bi bi-calendar-event" /> {dateRange(r)}{r.event_time ? `, ${timeRange(r)}` : ""}</span>
                <span><i className="bi bi-geo-alt" /> {place(r)}</span>
              </div>
              {r.close_reason && <div className="small mt-1 text-muted">Note: {r.close_reason}</div>}
            </div>
            <div className="d-flex flex-wrap gap-2">
              {r.live && <Link href={`/partner/find-artists?requirement=${r.id}`} className="cms-btn rounded-2 py-2 px-3"><i className="bi bi-send-plus me-1" />Invite Artists</Link>}
              {data.editable && <Link href={`/partner/requirements/edit?id=${r.id}`} className="border-btn rounded-2 py-2 px-3"><i className="bi bi-pencil-square me-1" />Edit</Link>}
              {r.live && <button type="button" className="btn btn-outline-secondary rounded-2" onClick={() => status("close")}><i className="bi bi-lock me-1" />Close</button>}
              {r.status === "closed" && <button type="button" className="btn btn-outline-success rounded-2" onClick={() => status("reopen")}><i className="bi bi-unlock me-1" />Reopen</button>}
              {(r.live || r.status === "closed") && <button type="button" className="btn btn-outline-danger rounded-2" onClick={() => status("cancel")}><i className="bi bi-x-circle me-1" />Cancel Event</button>}
            </div>
          </section>

          {r.status === "draft" ? (
            <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2">
              <i className="bi bi-pencil-square" /> <span className="flex-grow-1">This is a draft. {r.visibility === "public" ? "Artists are matched and emailed when you publish it." : "Publish it, then send engagement requests."}</span>
              <Link href={`/partner/requirements/edit?id=${r.id}`} className="cms-btn rounded-2 py-1 px-3">Edit &amp; Publish</Link>
            </div>
          ) : r.stats && (
            <div className="ar-kpis">
              <Kpi icon="bi-people" label="Artists Reached" value={r.stats.matched} />
              <Kpi icon="bi-send-check" label="Requests Sent" value={r.stats.invited} />
              <Kpi icon="bi-hand-thumbs-up" label="Accepted / Interested" value={r.stats.interested} tone="ok" />
              <Kpi icon="bi-calendar2-check" label="Booked" value={r.stats.booked} tone="warn" />
            </div>
          )}

          {r.status !== "draft" && (
            <Panel icon="bi-people" title="Artists & Responses">
              <p className="small text-muted">Contact details appear once an artist accepts your request or says they are interested. Confirm the programme on call or by email, then use <b>Record Booking</b>.</p>
              <MatchTable rows={data.matches} mode="partner" live={r.live} onBook={setBooking} onUpdate={updateBooking} onFeedback={setFeedback} />
            </Panel>
          )}
          {r.status !== "draft" && <MediaPanel requirementId={r.id} items={data.media} onChange={(media) => setData({ ...data, media })} />}
          <div className="row g-3">
            <div className="col-12"><RequirementDetails r={r} /></div>
          </div>
          {booking && <BookingDialog match={booking} requirementId={r.id} onClose={() => setBooking(null)} onSaved={() => { setBooking(null); reload(); }} />}
          {feedback && <FeedbackDialog match={feedback} requirementId={r.id} onClose={() => setFeedback(null)} onSaved={() => { setFeedback(null); reload(); }} />}
        </>
      )}
    </div>
  );
}

// ======================================================= artist / group / institute

type OppItem = {
  requirement: Pick<Requirement, "id" | "reference" | "title" | "status" | "status_label" | "live" | "organisation" | "organisation_type" | "organisation_verified" | "event_date" | "event_end_date" | "event_time" | "end_time" | "venue" | "city" | "budget" | "respond_by" | "programme_type">;
  mine: MatchState;
};
export type OppTab = "open" | "requests" | "bookings" | "saved" | "history";
type OppList = { items: OppItem[]; meta: Meta; counts: Record<OppTab | "all", number> };

const OPP_PAGES: Record<OppTab, { title: string; icon: string; intro: string; empty: string }> = {
  open: {
    title: "Find Opportunities", icon: "bi-search",
    intro: "Engagement Partners (hotels, event and festival organisers, corporates, cultural institutions, government departments) post opportunities. Those that fit your art form and location appear here and are emailed to you.",
    empty: "No open opportunities right now. Keep your profile complete and up to date so partners can find you.",
  },
  requests: {
    title: "Booking Requests", icon: "bi-envelope-open",
    intro: "Engagement requests sent to you directly by partners who viewed your profile. Accept or decline each request; the partner then confirms the booking with you by phone or email.",
    empty: "No pending booking requests.",
  },
  bookings: {
    title: "Confirmed Performances", icon: "bi-calendar2-check",
    intro: "Bookings the partner has confirmed with you. Keep in touch with the contact person for the programme details.",
    empty: "No confirmed performances yet.",
  },
  saved: { title: "Saved Opportunities", icon: "bi-bookmark-heart", intro: "Opportunities you saved to look at later.", empty: "You have not saved any opportunity." },
  history: {
    title: "Engagement History", icon: "bi-clock-history",
    intro: "Completed and cancelled bookings and past opportunities you responded to, with the partner's feedback.",
    empty: "No engagement history yet.",
  },
};

/** /artist/opportunities, /artist/booking-requests, /artist/performances, /artist/saved-opportunities, /artist/engagement-history */
export function OpportunityList({ tab = "open" }: { tab?: OppTab }) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApiData<OppList>(`/artist/opportunities?tab=${tab}&page=${page}`);
  const meta = OPP_PAGES[tab];

  return (
    <div className="container-fluid ar-page">
      <PageHeader title={meta.title} />
      <div className="bk-intro">
        <i className={`bi ${meta.icon}`} aria-hidden="true" />
        <div className="flex-grow-1">
          <p className="mb-0">{meta.intro}</p>
        </div>
        {data && (
          <div className="bk-intro-counts small text-nowrap">
            <Link href="/artist/booking-requests">Requests <b>{data.counts.requests}</b></Link>
            <Link href="/artist/performances">Confirmed <b>{data.counts.bookings}</b></Link>
          </div>
        )}
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : !data?.items.length ? (
        <div className="ar-empty">
          <i className="bi bi-inbox" aria-hidden="true" />
          <p>{meta.empty}</p>
          {tab === "open" && <Link href="/artist/profile" className="cms-btn rounded-2 py-2 px-3">Update My Profile</Link>}
        </div>
      ) : (
        <>
          <div className="bk-cards">
            {data.items.map(({ requirement: r, mine: m }) => (
              <Link key={r.id} href={`/artist/opportunities/view?id=${r.id}`} className="bk-card">
                <div className="d-flex justify-content-between gap-2 align-items-start">
                  <h3>{r.title}</h3>
                  {m.booking_status ? <span className={`badge ${BOOKING_BADGE[m.booking_status]}`}>{m.booking_label}</span>
                    : !r.live ? <span className="badge bg-secondary">{r.status === "cancelled" ? "Cancelled" : "Closed"}</span>
                    : m.invited && m.interest === "pending" ? <span className="badge bg-info text-dark">Request</span>
                    : <span className={`badge ${INTEREST_BADGE[m.interest]}`}>{m.interest === "pending" ? "New" : m.interest_label}</span>}
                </div>
                <div className="bk-card-org">
                  <i className="bi bi-building" aria-hidden="true" /> {r.organisation}
                  {r.organisation_verified && <i className="bi bi-patch-check-fill text-success ms-1" title="Verified partner" aria-label="Verified partner" />}
                </div>
                <ul>
                  <li><i className="bi bi-calendar-event" aria-hidden="true" /> {dateRange(r)}{r.event_time ? `, ${timeRange(r)}` : ""}</li>
                  <li><i className="bi bi-geo-alt" aria-hidden="true" /> {[r.venue, r.city].filter(Boolean).join(", ")}</li>
                  {r.programme_type && <li><i className="bi bi-tags" aria-hidden="true" /> {r.programme_type}</li>}
                  {r.budget && <li><i className="bi bi-currency-rupee" aria-hidden="true" /> {r.budget}</li>}
                  {r.respond_by && r.live && !m.booking_status && <li className="text-danger"><i className="bi bi-alarm" aria-hidden="true" /> Respond by {formatDate(r.respond_by)}</li>}
                  {m.rating && <li><Stars value={m.rating} /></li>}
                </ul>
                <span className="bk-card-link">{m.saved && <i className="bi bi-bookmark-fill me-1" aria-label="Saved" />}View details <i className="bi bi-arrow-right" aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
          <div className="d-flex justify-content-end mt-3">
            <Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} />
          </div>
        </>
      )}
    </div>
  );
}

/** /artist/opportunities/view?id= (opportunity id) */
export function OpportunityView() {
  const id = useSearchParams().get("id");
  const { data, error, loading, setData } = useApiData<{ requirement: Requirement; mine: MatchState; media: Media[]; can_respond: boolean }>(id ? `/artist/opportunities/${encodeURIComponent(id)}` : null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function respond(interest: "interested" | "not_available") {
    if (!data) return;
    if (interest === "not_available" && data.mine.invited
      && !(await confirmAction("Decline this request?", "The partner will be informed that you are not available.", "Yes, decline"))) return;
    setBusy(true);
    try {
      const res = await http.post<MatchState>(`/artist/opportunities/${data.requirement.id}/interest`, { interest, note: (note ?? data.mine.interest_note ?? "") || null });
      await success(res.message, "Response saved");
      setData({ ...data, mine: res.data });
    } catch (e) {
      await failure(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave() {
    if (!data) return;
    try {
      const res = await http.post<MatchState>(`/artist/opportunities/${data.requirement.id}/save`, { saved: !data.mine.saved });
      setData({ ...data, mine: res.data });
    } catch (e) {
      await failure(e);
    }
  }

  if (!id) return <div className="container-fluid"><PageHeader title="Opportunity" backHref="/artist/opportunities" /><ErrorBox message="No opportunity selected." /></div>;
  const r = data?.requirement;
  const m = data?.mine;
  return (
    <div className="container-fluid ar-page">
      <PageHeader title={m?.invited ? "Engagement Request" : "Opportunity"} backHref={m?.invited && !m.booking_status ? "/artist/booking-requests" : "/artist/opportunities"} />
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : r && m && data && (
        <>
          <section className="oh-card ar-hero compact">
            <div className="flex-grow-1 min-w-0">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <h2 className="ar-hero-name">{r.title}</h2>
                {m.invited && <span className="badge bg-info text-dark">Request for you</span>}
                {!r.live && !m.booking_status && <span className="badge bg-secondary">{r.status === "cancelled" ? "Cancelled" : "Closed"}</span>}
              </div>
              <div className="ar-hero-meta">
                <span><i className="bi bi-building" /> {r.organisation}{r.organisation_verified && <i className="bi bi-patch-check-fill text-success ms-1" title="Verified partner" aria-label="Verified partner" />}</span>
                <span><i className="bi bi-calendar-event" /> {dateRange(r)}</span>
                <span><i className="bi bi-geo-alt" /> {place(r)}</span>
              </div>
            </div>
            <button type="button" className={`border-btn rounded-2 py-2 px-3${m.saved ? " active" : ""}`} onClick={toggleSave} aria-pressed={m.saved}>
              <i className={`bi ${m.saved ? "bi-bookmark-fill" : "bi-bookmark"} me-1`} />{m.saved ? "Saved" : "Save"}
            </button>
          </section>

          {m.invited && m.invite_message && (
            <div className="alert alert-info"><i className="bi bi-chat-quote me-2" /><b>Message from the partner:</b> {m.invite_message}</div>
          )}

          <div className="row g-3">
            <div className="col-lg-8">
              <RequirementDetails r={r} showContact={false} />
              {(m.booking_status === "confirmed" || m.booking_status === "completed") && (
                <Panel icon="bi-images" title="Event Photos & Videos"><MediaGallery items={data.media} /></Panel>
              )}
            </div>
            <div className="col-lg-4">
              {m.booking_status && (
                <section className={`oh-card oh-panel ar-panel bk-booking-card ${m.booking_status}`}>
                  <h2 className="h6 fw-bold"><i className="bi bi-calendar2-check me-2" />{m.booking_label}</h2>
                  {m.confirmed_via_label && <p className="mb-1 small">Confirmed via {m.confirmed_via_label} on {formatDate(m.confirmed_on)}</p>}
                  {m.agreed_fee && <p className="mb-1 small">Agreed honorarium: <b>{m.agreed_fee}</b></p>}
                  {m.booking_remarks && <p className="mb-0 small text-muted">{m.booking_remarks}</p>}
                </section>
              )}
              {m.rating && (
                <Panel icon="bi-star" title="Partner Feedback">
                  <Stars value={m.rating} />
                  {m.feedback && <p className="mb-0 mt-2 bk-pre">{m.feedback}</p>}
                </Panel>
              )}
              <Panel icon="bi-chat-square-text" title="Your Response">
                <p className="mb-2">Current: <span className={`badge ${INTEREST_BADGE[m.interest]}`}>{m.interest_label}</span></p>
                {data.can_respond ? (
                  <>
                    <TextArea name="note" label="Message to the partner (optional)" rows={3} maxLength={1000}
                      placeholder="Your availability, team size, honorarium expectation…" value={note ?? m.interest_note ?? ""} onChange={setNote} />
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      <button type="button" className="cms-btn rounded-2 py-2 px-3" disabled={busy} onClick={() => respond("interested")}>
                        <i className="bi bi-hand-thumbs-up me-1" />{m.invited ? "Accept Request" : "I'm Interested"}
                      </button>
                      <button type="button" className="border-btn rounded-2 py-2 px-3" disabled={busy} onClick={() => respond("not_available")}>
                        {m.invited ? "Decline" : "Not Available"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="small text-muted mb-0">{m.booking_status === "confirmed" || m.booking_status === "completed" ? "You are booked for this event." : "This opportunity is no longer open for responses."}</p>
                )}
              </Panel>
              <Panel icon="bi-telephone" title="Partner Contact">
                <ContactCard name={r.contact_name} mobile={r.contact_mobile} email={r.contact_email} />
                <p className="small text-muted mt-2 mb-0">The partner confirms bookings by phone or email. Opportunity Hub does not take any fee.</p>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ======================================================= admin / ZCC

type AdminList = {
  items: Requirement[]; meta: Meta; counts: Record<"open" | "booked" | "closed" | "cancelled", number>;
  totals: { requirements: number; artists_matched: number; interested: number; booked: number };
  options: { states: IdName[]; art_forms: IdName[] }; can_edit: boolean;
};
type AdminFilters = { search: string; state_id: string; art_form_id: string; date_from: string; date_to: string };
const NO_FILTERS: AdminFilters = { search: "", state_id: "", art_form_id: "", date_from: "", date_to: "" };

function AdminTabs({ active }: { active: "requirements" | "bookings" }) {
  const { href } = useConsole();
  return (
    <nav className="ar-tabs" aria-label="Booking Management">
      <Link href={href("/bookings")} className={active === "requirements" ? "active" : ""}><i className="bi bi-megaphone" /> Opportunities</Link>
      <Link href={href("/bookings/confirmed")} className={active === "bookings" ? "active" : ""}><i className="bi bi-calendar2-check" /> Bookings</Link>
    </nav>
  );
}

function AdminFilterBar({ options, onApply }: { options?: { states: IdName[]; art_forms: IdName[] }; onApply: (f: AdminFilters) => void }) {
  const [f, setF] = useState<AdminFilters>(NO_FILTERS);
  return (
    <div className="bg-light border rounded-3 shadow-sm p-3 mb-3">
      <form className="row align-items-end g-3" onSubmit={(e) => { e.preventDefault(); onApply(f); }}>
        <div className="col-lg-3 col-md-6">
          <label className="form-label fw-bold" htmlFor="bk-search">Search</label>
          <input id="bk-search" type="search" className="form-control" maxLength={100} placeholder="Title, reference or partner" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
        </div>
        <div className="col-lg-2 col-md-6">
          <label className="form-label fw-bold" htmlFor="bk-state">State / UT</label>
          <select id="bk-state" className="form-select" value={f.state_id} onChange={(e) => setF({ ...f, state_id: e.target.value })}>
            <option value="">All</option>
            {options?.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="col-lg-2 col-md-6">
          <label className="form-label fw-bold" htmlFor="bk-art">Art Form</label>
          <select id="bk-art" className="form-select" value={f.art_form_id} onChange={(e) => setF({ ...f, art_form_id: e.target.value })}>
            <option value="">All</option>
            {options?.art_forms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="col-lg-2 col-md-6">
          <label className="form-label fw-bold" htmlFor="bk-from">Event From</label>
          <input id="bk-from" type="date" className="form-control" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} />
        </div>
        <div className="col-lg-2 col-md-6">
          <label className="form-label fw-bold" htmlFor="bk-to">Event To</label>
          <input id="bk-to" type="date" className="form-control" min={f.date_from || undefined} value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} />
        </div>
        <div className="col-lg-1 col-md-6 d-flex gap-2">
          <button type="submit" className="theme-btn rounded-2 py-2 px-3">Go</button>
          <button type="button" className="border-btn rounded-2 py-2 px-2" title="Reset" aria-label="Reset filters" onClick={() => { setF(NO_FILTERS); onApply(NO_FILTERS); }}><i className="bi bi-arrow-counterclockwise" /></button>
        </div>
      </form>
    </div>
  );
}

/** /admin/bookings */
export function BookingRequirements() {
  const { href } = useConsole();
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState<AdminFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams(Object.entries({ ...filters, status, page: String(page) }).filter(([, v]) => v));
  const { data, error, loading } = useApiData<AdminList>(`/bookings?${qs}`);
  const counts = data ? { "": data.totals.requirements, ...data.counts } : undefined;

  return (
    <div className="container-fluid">
      <PageHeader title="Booking Management" />
      <AdminTabs active="requirements" />
      {data && (
        <div className="ar-kpis">
          <Kpi icon="bi-megaphone" label="Opportunities Posted" value={data.totals.requirements} />
          <Kpi icon="bi-people" label="Artists Reached" value={data.totals.artists_matched} />
          <Kpi icon="bi-hand-thumbs-up" label="Accepted / Interested" value={data.totals.interested} tone="ok" />
          <Kpi icon="bi-calendar2-check" label="Bookings" value={data.totals.booked} tone="warn" />
        </div>
      )}
      <AdminFilterBar options={data?.options} onApply={(f) => { setFilters(f); setPage(1); }} />
      <div className="mb-3">
        <StatusTabs tabs={[["", "All"], ["open", "Open"], ["booked", "Booked"], ["closed", "Closed"], ["cancelled", "Cancelled"]]} active={status} counts={counts} onChange={(k) => { setStatus(k); setPage(1); }} />
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead>
                <tr>
                  <th className="bk-col-sno">S.No.</th>
                  <th>Opportunity</th>
                  <th>Posted by</th>
                  <th>Event Date</th>
                  <th>Art Form</th>
                  <th>Artists / Accepted / Booked</th>
                  <th>Status</th>
                  <th className="bk-col-view">View</th>
                </tr>
              </thead>
              <tbody>
                {!data?.items.length ? (
                  <tr><td colSpan={8} className="text-center py-4">No opportunities found.</td></tr>
                ) : data.items.map((r, i) => (
                  <tr key={r.id}>
                    <td>{(data.meta.from ?? 1) + i}</td>
                    <td><b>{r.title}</b><small className="d-block text-muted">{r.reference} · {place(r)}</small></td>
                    <td className="small">{r.organisation}{r.organisation_type && <span className="d-block text-muted">{r.organisation_type}</span>}</td>
                    <td className="small">{dateRange(r)}</td>
                    <td className="small">{[r.art_form, r.sub_art_form].filter(Boolean).join(" – ")}</td>
                    <td><span className="bk-stats">{r.stats?.matched ?? 0} / <b className="text-success">{r.stats?.interested ?? 0}</b> / <b>{r.stats?.booked ?? 0}</b></span></td>
                    <td><ReqBadge r={r} /></td>
                    <td><Link href={`${href("/bookings/view")}?id=${r.id}`} className="btn btn-sm btn-outline-info" title="View" aria-label="View opportunity"><i className="bi bi-eye" /></Link></td>
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

type ConfirmedRow = {
  match_id: number; requirement_id: number; reference: string; title: string; event_date: string; organisation: string;
  artist: ArtistInfo | null; booking_status: "confirmed" | "completed" | "cancelled"; confirmed_via: string | null; confirmed_on: string | null;
  agreed_fee: string | null; remarks: string | null; booked_at: string | null;
};

/** /admin/bookings/confirmed */
export function BookingConfirmedList() {
  const { href } = useConsole();
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState<AdminFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams(Object.entries({ ...filters, booking_status: status, page: String(page) }).filter(([, v]) => v));
  const { data, error, loading } = useApiData<{ items: ConfirmedRow[]; meta: Meta; options: { states: IdName[]; art_forms: IdName[] } }>(`/bookings/confirmed?${qs}`);

  return (
    <div className="container-fluid">
      <PageHeader title="Booking Management" />
      <AdminTabs active="bookings" />
      <AdminFilterBar options={data?.options} onApply={(f) => { setFilters(f); setPage(1); }} />
      <div className="mb-3">
        <StatusTabs tabs={[["", "All"], ["confirmed", "Confirmed"], ["completed", "Completed"], ["cancelled", "Cancelled"]]} active={status} onChange={(k) => { setStatus(k); setPage(1); }} />
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead>
                <tr>
                  <th className="bk-col-sno">S.No.</th>
                  <th>Artist</th>
                  <th>Opportunity / Partner</th>
                  <th>Event Date</th>
                  <th>Confirmed</th>
                  <th>Agreed (note)</th>
                  <th>Status</th>
                  <th className="bk-col-view">View</th>
                </tr>
              </thead>
              <tbody>
                {!data?.items.length ? (
                  <tr><td colSpan={8} className="text-center py-4">No bookings found.</td></tr>
                ) : data.items.map((b, i) => (
                  <tr key={b.match_id}>
                    <td>{(data.meta.from ?? 1) + i}</td>
                    <td><b>{b.artist?.name ?? "—"}</b><small className="d-block text-muted">{b.artist?.type} {b.artist?.mobile ? `· ${b.artist.mobile}` : ""}</small></td>
                    <td><span className="d-block">{b.title}</span><small className="text-muted">{b.reference} · {b.organisation}</small></td>
                    <td className="small">{formatDate(b.event_date)}</td>
                    <td className="small">{b.confirmed_via === "email" ? "Email" : b.confirmed_via === "call" ? "Phone call" : "—"}<br />{formatDate(b.confirmed_on)}</td>
                    <td className="small">{dash(b.agreed_fee)}</td>
                    <td><span className={`badge ${BOOKING_BADGE[b.booking_status]}`}>{b.booking_status === "confirmed" ? "Confirmed" : b.booking_status === "completed" ? "Completed" : "Cancelled"}</span></td>
                    <td><Link href={`${href("/bookings/view")}?id=${b.requirement_id}`} className="btn btn-sm btn-outline-info" title="View" aria-label="View opportunity"><i className="bi bi-eye" /></Link></td>
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

/** /admin/bookings/view?id= */
export function BookingAdminView() {
  const id = useSearchParams().get("id");
  const { href, can } = useConsole();
  const { data, error, loading, reload } = useApiData<{
    requirement: Requirement; matches: MatchRow[]; media: Media[]; can_edit: boolean;
    organisation: { id: number; is_partner: boolean; name: string; regno: string | null; category: string | null; contact_person: string; email: string | null; mobile: string | null } | null;
  }>(id ? `/bookings/${encodeURIComponent(id)}` : null);

  async function status(action: "close" | "cancel" | "reopen") {
    if (!data) return;
    let reason: string | null = null;
    if (action !== "reopen") {
      reason = await promptText(action === "cancel" ? "Cancel this opportunity?" : "Close this opportunity?", "Reason (recorded on the opportunity)", true);
      if (reason === null) return;
    } else if (!(await confirmAction("Reopen this opportunity?", "Artists will be able to respond again.", "Yes, reopen"))) return;
    try {
      const res = await http.post(`/bookings/${data.requirement.id}/status`, { action, reason });
      await success(res.message);
      reload();
    } catch (e) {
      await failure(e);
    }
  }

  const back = href("/bookings");
  if (!id) return <div className="container-fluid"><PageHeader title="Opportunity" backHref={back} /><ErrorBox message="No opportunity selected." /></div>;
  const r = data?.requirement;
  return (
    <div className="container-fluid">
      <PageHeader title="Opportunity Details" backHref={back} />
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : r && data && (
        <>
          <section className="oh-card ar-hero compact">
            <div className="flex-grow-1 min-w-0">
              <div className="d-flex flex-wrap align-items-center gap-2">
                <h2 className="ar-hero-name">{r.title}</h2>
                <ReqBadge r={r} />
                {r.visibility === "invite_only" && <span className="badge bg-info text-dark">Invite only</span>}
              </div>
              <div className="ar-hero-meta">
                <span><i className="bi bi-hash" /> {r.reference}</span>
                <span><i className="bi bi-calendar-event" /> {dateRange(r)}</span>
                <span><i className="bi bi-geo-alt" /> {place(r)}</span>
                <span><i className="bi bi-send" /> Published {formatDate(r.published_at, true)}</span>
              </div>
              {r.close_reason && <div className="small mt-1 text-muted">Note: {r.close_reason}</div>}
            </div>
            {data.can_edit && (
              <div className="d-flex flex-wrap gap-2">
                {r.live && <button type="button" className="btn btn-outline-secondary rounded-2" onClick={() => status("close")}><i className="bi bi-lock me-1" />Close</button>}
                {r.status === "closed" && <button type="button" className="btn btn-outline-success rounded-2" onClick={() => status("reopen")}><i className="bi bi-unlock me-1" />Reopen</button>}
                {(r.live || r.status === "closed") && <button type="button" className="btn btn-outline-danger rounded-2" onClick={() => status("cancel")}><i className="bi bi-x-circle me-1" />Cancel</button>}
              </div>
            )}
          </section>
          {r.stats && (
            <div className="ar-kpis">
              <Kpi icon="bi-people" label="Artists Reached" value={r.stats.matched} />
              <Kpi icon="bi-send-check" label="Requests Sent" value={r.stats.invited} />
              <Kpi icon="bi-hand-thumbs-up" label="Accepted / Interested" value={r.stats.interested} tone="ok" />
              <Kpi icon="bi-calendar2-check" label="Booked" value={r.stats.booked} tone="warn" />
            </div>
          )}
          <Panel icon="bi-people" title="Artists & Responses">
            <MatchTable rows={data.matches} mode="admin" live={r.live} />
          </Panel>
          {data.media.length > 0 && <Panel icon="bi-images" title="Event Photos & Videos"><MediaGallery items={data.media} /></Panel>}
          <div className="row g-3">
            <div className="col-lg-8"><RequirementDetails r={r} showContact={false} /></div>
            <div className="col-lg-4">
              {data.organisation && (
                <Panel icon="bi-building" title={data.organisation.is_partner ? "Engagement Partner" : "Posted by"}
                  action={data.organisation.is_partner && can("/engagement-partners") ? <Link href={`${href("/engagement-partners/view")}?id=${data.organisation.id}`} className="oh-viewall">Profile <i className="bi bi-arrow-right" /></Link> : undefined}>
                  <dl className="ar-dl single">
                    <div><dt>Name</dt><dd>{data.organisation.name}</dd></div>
                    <div><dt>Registration No.</dt><dd>{dash(data.organisation.regno)}</dd></div>
                    <div><dt>Type</dt><dd>{dash(data.organisation.category)}</dd></div>
                    <div><dt>Contact Person</dt><dd>{data.organisation.contact_person}</dd></div>
                  </dl>
                  <div className="mt-2"><ContactCard name="Account contact" mobile={data.organisation.mobile} email={data.organisation.email} /></div>
                </Panel>
              )}
              <Panel icon="bi-telephone" title="Event Contact Person">
                <ContactCard name={r.contact_name} mobile={r.contact_mobile} email={r.contact_email} />
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
