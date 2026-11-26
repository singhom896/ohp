"use client";

// Engagement Partner console (role 11, /partner/*): dashboard, organisation
// profile, artist search / profiles / shortlist, engagement requests,
// bookings & history and reports. Opportunities themselves live in bookings.tsx.
// Backend: App\Http\Controllers\Api\V1\Partner\*. No payment anywhere.
/* eslint-disable @next/next/no-img-element -- uploads are served by the Laravel host */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { http, toFormData } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";
import { useApiData } from "../crud/useApi";
import { dash, formatDate } from "../crud/common";
import { Pagination } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { failure, success } from "../ui/alerts";
import { downloadCsv } from "../ui/csv";
import { FileInput, SelectInput, TextArea, TextInput, toOptions } from "../ui/fields";
import {
  BOOKING_BADGE, INTEREST_BADGE, Kpi, Panel, Stars, StatusTabs, dateRange,
  type MatchState, type Meta, type Requirement,
} from "./bookings";

type IdName = { id: number; name: string };
type Artist = {
  id: number; name: string; type: string; type_key: "individual" | "group" | "organisation"; regno: string | null;
  location: string; art_forms: string[]; photo: string | null; accredited: boolean; shortlisted?: boolean;
  email?: string | null; mobile?: string | null;
};

function Avatar({ src, icon = "bi-person" }: { src: string | null; icon?: string }) {
  return <span className="bk-avatar">{src ? <img src={src} alt="" /> : <i className={`bi ${icon}`} aria-hidden="true" />}</span>;
}

const TYPE_ICON: Record<Artist["type_key"], string> = { individual: "bi-person", group: "bi-people", organisation: "bi-building" };

// ================================================================ dashboard

type DashboardData = {
  organisation: string; partner_type: string;
  profile: { completion: number; complete: boolean; verified: boolean };
  stats: Record<"opportunities" | "live" | "drafts" | "requests_sent" | "awaiting" | "interested" | "confirmed" | "completed" | "shortlisted", number>;
  upcoming: (MatchState & { requirement_id: number; title: string; event_date: string; venue: string | null; artist: string })[];
  responses: (MatchState & { requirement_id: number; title: string; event_date: string; artist: string })[];
  unread_notifications: number;
};

/** /partner/dashboard */
export function PartnerDashboard() {
  const { data, error, loading } = useApiData<DashboardData>("/partner/dashboard");
  if (loading && !data) return <Loader />;
  if (!data) return <ErrorBox message={error ?? "Unable to load the dashboard."} />;
  const s = data.stats;

  return (
    <div className="oh-dash">
      <section className="oh-card oh-welcome" aria-label="Welcome">
        <div className="oh-welcome-text">
          <h1>Welcome, {data.organisation}</h1>
          <p>{data.partner_type} · Engagement Partner{data.profile.verified ? " · Verified" : ""}. Discover artists, post opportunities and manage bookings.</p>
        </div>
      </section>

      {!data.profile.complete && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2">
          <i className="bi bi-building-gear" aria-hidden="true" />
          <span className="flex-grow-1">Your organisation profile is {data.profile.completion}% complete. Complete it to post opportunities and send engagement requests.</span>
          <Link href="/partner/partner-profile" className="cms-btn rounded-2 py-1 px-3">Complete Profile</Link>
        </div>
      )}

      <div className="ar-kpis">
        <Kpi icon="bi-megaphone" label="Live Opportunities" value={s.live} />
        <Kpi icon="bi-send-check" label="Requests Awaiting Reply" value={s.awaiting} tone="warn" />
        <Kpi icon="bi-hand-thumbs-up" label="Accepted / Interested" value={s.interested} tone="ok" />
        <Kpi icon="bi-calendar2-check" label="Confirmed Bookings" value={s.confirmed} />
        <Kpi icon="bi-flag" label="Completed" value={s.completed} tone="ok" />
        <Kpi icon="bi-star" label="Shortlisted Artists" value={s.shortlisted} />
      </div>

      <div className="pt-quick">
        <Link href="/partner/requirements/create" className="pt-quick-item"><i className="bi bi-plus-circle" aria-hidden="true" /><span>Post Opportunity</span></Link>
        <Link href="/partner/find-artists" className="pt-quick-item"><i className="bi bi-search" aria-hidden="true" /><span>Search Artists</span></Link>
        <Link href="/partner/engagements" className="pt-quick-item"><i className="bi bi-send-check" aria-hidden="true" /><span>Engagement Requests</span></Link>
        <Link href="/partner/partner-bookings" className="pt-quick-item"><i className="bi bi-calendar2-check" aria-hidden="true" /><span>Bookings &amp; History</span></Link>
        <Link href="/partner/notifications" className="pt-quick-item"><i className="bi bi-bell" aria-hidden="true" /><span>Notifications{data.unread_notifications ? ` (${data.unread_notifications})` : ""}</span></Link>
      </div>

      <div className="oh-row-2">
        <Panel icon="bi-calendar3" title="Upcoming Bookings">
          {!data.upcoming.length ? <p className="oh-empty">No upcoming bookings.</p> : (
            <ul className="pt-list">
              {data.upcoming.map((b) => (
                <li key={b.match_id}>
                  <Link href={`/partner/requirements/view?id=${b.requirement_id}`}><b>{b.title}</b></Link>
                  <span>{b.artist} · {formatDate(b.event_date)}{b.venue ? ` · ${b.venue}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel icon="bi-chat-square-text" title="Latest Responses">
          {!data.responses.length ? <p className="oh-empty">No responses yet.</p> : (
            <ul className="pt-list">
              {data.responses.map((r) => (
                <li key={r.match_id}>
                  <Link href={`/partner/requirements/view?id=${r.requirement_id}`}><b>{r.artist}</b></Link>
                  <span><span className={`badge ${INTEREST_BADGE[r.interest]}`}>{r.interest_label}</span> · {r.title} · {formatDate(r.responded_at, true)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ================================================================ profile

type ProfileData = {
  profile: Record<string, string | null>;
  completion: number; complete: boolean; verified: boolean; missing: string[];
  options: { partner_types: string[]; states: IdName[]; districts: (IdName & { state_id: number })[] };
  account: { regno: string | null; email: string; mobile: string };
};
const PROFILE_FIELDS = ["organisation_name", "partner_type", "contact_person", "designation", "description", "address", "state_id", "district_id",
  "city", "pincode", "official_email", "contact_number", "website", "document_name"] as const;
type ProfileForm = Record<(typeof PROFILE_FIELDS)[number], string>;

const FIELD_LABELS: Record<string, string> = {
  organisation_name: "Organisation Name", partner_type: "Organisation Type", contact_person: "Contact Person", description: "Organisation Description",
  address: "Registered Address", state_id: "State / UT", district_id: "District", city: "City", pincode: "PIN Code",
  official_email: "Official Email", contact_number: "Contact Number",
};

/** /partner/partner-profile */
export function PartnerProfile() {
  const { data, error, loading, setData } = useApiData<ProfileData>("/partner/profile");
  if (loading && !data) return <Loader />;
  if (!data) return <ErrorBox message={error ?? "Unable to load your profile."} />;
  return <PartnerProfileForm data={data} onSaved={setData} />;
}

function PartnerProfileForm({ data, onSaved }: { data: ProfileData; onSaved: (d: ProfileData) => void }) {
  const initial = useMemo(() => Object.fromEntries(PROFILE_FIELDS.map((k) => [k, data.profile[k] ?? ""])) as ProfileForm, [data.profile]);
  const [f, setF] = useState<ProfileForm>(initial);
  const [logo, setLogo] = useState<File | null>(null);
  const [doc, setDoc] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const set = (k: keyof ProfileForm) => (v: string) => setF((c) => ({ ...c, [k]: v }));
  const err = (k: string) => errors[k]?.[0];
  const districts = data.options.districts.filter((d) => String(d.state_id) === f.state_id);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value === "draft" ? "draft" : "save";
    setBusy(true);
    setErrors({});
    try {
      const res = await http.post<Omit<ProfileData, "options" | "account">>("/partner/profile", toFormData({ ...f, action, logo: logo ?? undefined, document: doc ?? undefined }));
      onSaved({ ...data, ...res.data });
      setLogo(null); setDoc(null); setFileKey((k) => k + 1);
      await success(res.message, "Saved");
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) {
        setErrors(ex.errors);
        window.setTimeout(() => document.querySelector(".pt-profile .text-danger, .pt-profile .is-invalid")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      } else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-fluid ap-page">
      <PageHeader title="Organisation Profile" />
      <section className="oh-card ar-hero compact">
        <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
          <span className="pt-logo">{data.profile.logo ? <img src={data.profile.logo} alt="Organisation logo" /> : <i className="bi bi-building" aria-hidden="true" />}</span>
          <div className="min-w-0">
            <h2 className="ar-hero-name">{data.profile.organisation_name}</h2>
            <div className="ar-hero-meta">
              <span><i className="bi bi-tags" /> {data.profile.partner_type}</span>
              <span><i className="bi bi-hash" /> {dash(data.account.regno)}</span>
              {data.verified && <span className="text-success"><i className="bi bi-patch-check-fill" /> Verified Partner</span>}
            </div>
          </div>
        </div>
        <div className="pt-progress" aria-label={`Profile ${data.completion}% complete`}>
          <div className="d-flex justify-content-between small"><span>Profile completion</span><b>{data.completion}%</b></div>
          <div className="progress"><div className={`progress-bar pt-w-${Math.round(data.completion / 10) * 10}`} role="progressbar" aria-valuenow={data.completion} aria-valuemin={0} aria-valuemax={100} /></div>
        </div>
      </section>
      {!data.complete && data.missing.length > 0 && (
        <div className="alert alert-warning"><i className="bi bi-info-circle me-2" />Still needed: {data.missing.map((m) => FIELD_LABELS[m] ?? m).join(", ")}. You can save your progress and finish later.</div>
      )}

      <form className="form-box ap-form pt-profile" noValidate onSubmit={save}>
        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-building" aria-hidden="true" /><div><h2>Organisation</h2></div></header>
          <div className="row g-3">
            <div className="col-lg-6"><TextInput name="organisation_name" label="Organisation / Business Name" icon="bi-building" required maxLength={200} value={f.organisation_name} onChange={set("organisation_name")} error={err("organisation_name")} /></div>
            <div className="col-lg-6"><SelectInput name="partner_type" label="Organisation Type" icon="bi-tags" required value={f.partner_type} onChange={set("partner_type")} options={data.options.partner_types.map((t) => ({ value: t, label: t }))} error={err("partner_type")} /></div>
            <div className="col-12"><TextArea name="description" label="Organisation Description" required rows={4} maxLength={3000} placeholder="What your organisation does and the kind of events you host" value={f.description} onChange={set("description")} error={err("description")} /></div>
            <div className="col-lg-6"><TextInput name="website" label="Website" icon="bi-globe" type="url" maxLength={255} placeholder="https://" value={f.website} onChange={set("website")} error={err("website")} /></div>
            <div className="col-lg-6"><FileInput key={`logo-${fileKey}`} name="logo" label="Organisation Logo" icon="bi-image" accept="image/jpeg,image/png,image/webp" onChange={(fs) => setLogo(fs[0] ?? null)} error={err("logo")} help="JPG, PNG or WebP, up to 2 MB." currentUrl={data.profile.logo} currentLabel="View current logo" /></div>
          </div>
        </section>

        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-person-lines-fill" aria-hidden="true" /><div><h2>Contact Person</h2></div></header>
          <div className="row g-3">
            <div className="col-lg-4"><TextInput name="contact_person" label="Contact Person Name" icon="bi-person" required maxLength={150} value={f.contact_person} onChange={set("contact_person")} error={err("contact_person")} /></div>
            <div className="col-lg-4"><TextInput name="designation" label="Designation" icon="bi-briefcase" maxLength={100} value={f.designation} onChange={set("designation")} error={err("designation")} /></div>
            <div className="col-lg-4"><TextInput name="contact_number" label="Contact Number" icon="bi-phone" required inputMode="numeric" maxLength={10} value={f.contact_number} onChange={(v) => set("contact_number")(v.replace(/\D/g, "").slice(0, 10))} error={err("contact_number")} /></div>
            <div className="col-lg-6"><TextInput name="official_email" label="Official Email" icon="bi-envelope" type="email" required maxLength={191} value={f.official_email} onChange={set("official_email")} error={err("official_email")} /></div>
            <div className="col-lg-6"><TextInput name="login_email" label="Login Email (account)" icon="bi-shield-lock" value={data.account.email} onChange={() => {}} readOnly help="Change your login details from Update Profile in the top menu." /></div>
          </div>
        </section>

        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-geo-alt" aria-hidden="true" /><div><h2>Registered Address</h2></div></header>
          <div className="row g-3">
            <div className="col-12"><TextArea name="address" label="Address" required rows={2} maxLength={500} value={f.address} onChange={set("address")} error={err("address")} /></div>
            <div className="col-lg-3 col-md-6"><SelectInput name="state_id" label="State / UT" icon="bi-map" required value={f.state_id} onChange={(v) => setF((c) => ({ ...c, state_id: v, district_id: "" }))} options={toOptions(data.options.states)} placeholder="Select State / UT" error={err("state_id")} /></div>
            <div className="col-lg-3 col-md-6"><SelectInput name="district_id" label="District" icon="bi-geo" required value={f.district_id} onChange={set("district_id")} options={toOptions(districts)} placeholder={f.state_id ? "Select district" : "Select State / UT first"} disabled={!f.state_id} error={err("district_id")} /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="city" label="City" icon="bi-buildings" required maxLength={100} value={f.city} onChange={set("city")} error={err("city")} /></div>
            <div className="col-lg-3 col-md-6"><TextInput name="pincode" label="PIN Code" icon="bi-mailbox" required inputMode="numeric" maxLength={6} value={f.pincode} onChange={(v) => set("pincode")(v.replace(/\D/g, "").slice(0, 6))} error={err("pincode")} /></div>
          </div>
        </section>

        <section className="ap-section">
          <header className="ap-section-head"><i className="bi bi-file-earmark-text" aria-hidden="true" /><div><h2>Supporting Document</h2><p>Optional: registration certificate, GST / trade licence or an authorisation letter.</p></div></header>
          <div className="row g-3">
            <div className="col-lg-6"><TextInput name="document_name" label="Document Name" icon="bi-card-heading" maxLength={150} placeholder="e.g. Registration Certificate" value={f.document_name} onChange={set("document_name")} error={err("document_name")} /></div>
            <div className="col-lg-6"><FileInput key={`doc-${fileKey}`} name="document" label="Upload Document" accept="application/pdf,image/jpeg,image/png" onChange={(fs) => setDoc(fs[0] ?? null)} error={err("document")} help="PDF, JPG or PNG, up to 5 MB." currentUrl={data.profile.document} currentLabel="View current document" /></div>
          </div>
        </section>

        <div className="ap-actions">
          <button type="button" className="border-btn rounded-2" disabled={busy} onClick={() => { setF(initial); setErrors({}); }}>Reset</button>
          <button type="submit" value="draft" className="border-btn rounded-2" disabled={busy}><i className="bi bi-save me-2" />Save Progress</button>
          <button type="submit" value="save" className="cms-btn rounded-2" disabled={busy}>
            {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : <i className="bi bi-check2 me-2" />}Save Profile
          </button>
        </div>
      </form>
    </div>
  );
}

// ================================================================ invite dialog

/** Send engagement requests to the given artists for one of my live opportunities. */
function InviteDialog({ artists, presetRequirement, onClose, onSent }: { artists: Pick<Artist, "id" | "name">[]; presetRequirement?: string | null; onClose: () => void; onSent: () => void }) {
  const opps = useApiData<{ items: Requirement[]; can_post: boolean }>("/partner/requirements?live=1");
  const [requirementId, setRequirementId] = useState(presetRequirement ?? "");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const live = (opps.data?.items ?? []).filter((r) => r.live);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!requirementId) { setErrors({ requirement_id: ["Select the opportunity."] }); return; }
    setBusy(true);
    setErrors({});
    try {
      const res = await http.post(`/partner/requirements/${requirementId}/invite`, { artist_ids: artists.map((a) => a.id), message: message || null });
      await success(res.message, "Request sent");
      onSent();
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) setErrors(ex.errors);
      else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal d-block" role="dialog" aria-modal="true" aria-labelledby="pt-invite-title" tabIndex={-1}>
        <div className="modal-dialog modal-dialog-centered">
          <form className="modal-content bk-dialog" onSubmit={send} noValidate>
            <div className="modal-header">
              <h2 className="modal-title h5" id="pt-invite-title"><i className="bi bi-send-plus me-2" />Send Engagement Request</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} disabled={busy} />
            </div>
            <div className="modal-body">
              <p className="mb-3">To: <b>{artists.map((a) => a.name).join(", ")}</b>. They are informed by email and in their dashboard, and can accept or decline.</p>
              {opps.loading ? <Loader /> : !live.length ? (
                <div className="alert alert-warning mb-0">
                  You have no published opportunity for a future event. <Link href="/partner/requirements/create">Post an opportunity</Link> first (choose &quot;Invite only&quot; for a private event).
                </div>
              ) : (
                <>
                  <SelectInput name="requirement_id" label="Opportunity" icon="bi-megaphone" required value={requirementId} onChange={setRequirementId}
                    options={live.map((r) => ({ value: String(r.id), label: `${r.title} – ${formatDate(r.event_date)}` }))} placeholder="Select opportunity" error={errors.requirement_id?.[0]} />
                  <div className="mt-3">
                    <TextArea name="message" label="Message (optional)" rows={3} maxLength={1000} placeholder="A short note about the programme" value={message} onChange={setMessage} error={errors.message?.[0]} />
                  </div>
                  {errors.artist_ids && <div className="alert alert-danger mt-3 mb-0">{errors.artist_ids[0]}</div>}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="cms-btn rounded-2 py-2 px-3" disabled={busy || !live.length}>
                {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}Send Request
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}

async function toggleShortlist(a: Pick<Artist, "id" | "name">, on: boolean): Promise<boolean> {
  try {
    const res = on ? await http.post("/partner/shortlist", { artist_id: a.id }) : await http.delete(`/partner/shortlist/${a.id}`);
    await success(res.message);
    return on;
  } catch (e) {
    await failure(e);
    return !on;
  }
}

// ================================================================ search

type SearchOptions = {
  art_forms: IdName[]; sub_art_forms: (IdName & { parent_id: number })[]; states: IdName[];
  districts: (IdName & { state_id: number })[]; types: { value: string; label: string }[];
};
type SearchFilters = { search: string; type: string; art_form: string; sub_art_form: string; state_id: string; district_id: string; location: string; accreditation: string };
const NO_SEARCH: SearchFilters = { search: "", type: "", art_form: "", sub_art_form: "", state_id: "", district_id: "", location: "", accreditation: "accredited" };

/** /partner/find-artists (?requirement= preselects the opportunity for requests) */
export function ArtistSearch() {
  const requirement = useSearchParams().get("requirement");
  const [draft, setDraft] = useState<SearchFilters>(NO_SEARCH);
  const [filters, setFilters] = useState<SearchFilters>(NO_SEARCH);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [invite, setInvite] = useState<Pick<Artist, "id" | "name">[] | null>(null);
  const qs = new URLSearchParams(Object.entries({ ...filters, page: String(page) }).filter(([, v]) => v));
  const { data, error, loading, setData } = useApiData<{ items: Artist[]; meta: Meta; options: SearchOptions }>(`/partner/artists?${qs}`);
  const o = data?.options;
  const subs = (o?.sub_art_forms ?? []).filter((s) => String(s.parent_id) === draft.art_form);
  const districts = (o?.districts ?? []).filter((d) => String(d.state_id) === draft.state_id);
  const set = (k: keyof SearchFilters) => (v: string) => setDraft((c) => ({ ...c, [k]: v }));
  const pickedList = Object.entries(picked).map(([id, name]) => ({ id: Number(id), name }));

  async function shortlist(a: Artist) {
    const on = await toggleShortlist(a, !a.shortlisted);
    if (data) setData({ ...data, items: data.items.map((x) => (x.id === a.id ? { ...x, shortlisted: on } : x)) });
  }

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Search Artists" />
      {requirement && <div className="alert alert-info"><i className="bi bi-send-plus me-2" />Select artists and use <b>Send Request</b> to invite them to your opportunity.</div>}
      <div className="bg-light border rounded-3 shadow-sm p-3 mb-3">
        <form className="row align-items-end g-3" onSubmit={(e) => { e.preventDefault(); setFilters(draft); setPage(1); }}>
          <div className="col-lg-4 col-md-6">
            <label className="form-label fw-bold" htmlFor="pt-q">Name / Registration ID</label>
            <input id="pt-q" type="search" className="form-control" maxLength={100} value={draft.search} onChange={(e) => set("search")(e.target.value)} />
          </div>
          <div className="col-lg-4 col-md-6">
            <label className="form-label fw-bold" htmlFor="pt-type">Category</label>
            <select id="pt-type" className="form-select" value={draft.type} onChange={(e) => set("type")(e.target.value)}>
              <option value="">All – artists, groups, institutes</option>
              {o?.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="col-lg-4 col-md-6">
            <label className="form-label fw-bold" htmlFor="pt-acc">Accreditation</label>
            <select id="pt-acc" className="form-select" value={draft.accreditation} onChange={(e) => set("accreditation")(e.target.value)}>
              <option value="accredited">Accredited / verified only</option>
              <option value="all">Include profiles under review</option>
            </select>
          </div>
          <div className="col-lg-3 col-md-6">
            <label className="form-label fw-bold" htmlFor="pt-art">Art Form</label>
            <select id="pt-art" className="form-select" value={draft.art_form} onChange={(e) => setDraft((c) => ({ ...c, art_form: e.target.value, sub_art_form: "" }))}>
              <option value="">All</option>
              {o?.art_forms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-lg-3 col-md-6">
            <label className="form-label fw-bold" htmlFor="pt-sub">Specialisation</label>
            <select id="pt-sub" className="form-select" value={draft.sub_art_form} disabled={!subs.length} onChange={(e) => set("sub_art_form")(e.target.value)}>
              <option value="">Any</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-lg-2 col-md-4">
            <label className="form-label fw-bold" htmlFor="pt-state">State / UT</label>
            <select id="pt-state" className="form-select" value={draft.state_id} onChange={(e) => setDraft((c) => ({ ...c, state_id: e.target.value, district_id: "" }))}>
              <option value="">All</option>
              {o?.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-lg-2 col-md-4">
            <label className="form-label fw-bold" htmlFor="pt-district">District</label>
            <select id="pt-district" className="form-select" value={draft.district_id} disabled={!draft.state_id} onChange={(e) => set("district_id")(e.target.value)}>
              <option value="">All</option>
              {districts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-lg-2 col-md-4">
            <label className="form-label fw-bold" htmlFor="pt-loc">City / Location</label>
            <input id="pt-loc" type="search" className="form-control" maxLength={100} value={draft.location} onChange={(e) => set("location")(e.target.value)} />
          </div>
          <div className="col-12 d-flex flex-wrap gap-2 justify-content-end">
            <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={() => { setDraft(NO_SEARCH); setFilters(NO_SEARCH); setPage(1); }}>Reset</button>
            <button type="submit" className="theme-btn rounded-2 py-2 px-3"><i className="bi bi-search me-1" />Search</button>
          </div>
        </form>
      </div>

      {pickedList.length > 0 && (
        <div className="pt-picked">
          <span><b>{pickedList.length}</b> selected</span>
          <button type="button" className="cms-btn rounded-2 py-1 px-3" onClick={() => setInvite(pickedList)}><i className="bi bi-send-plus me-1" />Send Request</button>
          <button type="button" className="border-btn rounded-2 py-1 px-3" onClick={() => setPicked({})}>Clear</button>
        </div>
      )}

      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : !data?.items.length ? (
        <div className="ar-empty"><i className="bi bi-search" aria-hidden="true" /><p>No artists match these filters.</p></div>
      ) : (
        <>
          <p className="small text-muted mb-2">{data.meta.total} found</p>
          <div className="pt-artist-grid">
            {data.items.map((a) => (
              <article key={a.id} className={`pt-artist${picked[a.id] ? " picked" : ""}`}>
                <label className="pt-pick">
                  <input type="checkbox" checked={!!picked[a.id]} onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[a.id] = a.name; else delete n[a.id]; return n; })} />
                  <span className="visually-hidden">Select {a.name}</span>
                </label>
                <div className="d-flex gap-2 align-items-center">
                  <Avatar src={a.photo} icon={TYPE_ICON[a.type_key]} />
                  <div className="min-w-0">
                    <h3><Link href={`/partner/find-artists/view?id=${a.id}${requirement ? `&requirement=${requirement}` : ""}`}>{a.name}</Link></h3>
                    <small className="text-muted">{a.type}</small>
                  </div>
                </div>
                <ul>
                  <li><i className="bi bi-palette" aria-hidden="true" /> {a.art_forms.join(", ") || "—"}</li>
                  <li><i className="bi bi-geo-alt" aria-hidden="true" /> {a.location || "—"}</li>
                  <li>{a.accredited ? <span className="text-success"><i className="bi bi-patch-check-fill" aria-hidden="true" /> Accredited</span> : <span className="text-muted"><i className="bi bi-hourglass-split" aria-hidden="true" /> Under review</span>}</li>
                </ul>
                <div className="d-flex gap-2 mt-auto">
                  <Link href={`/partner/find-artists/view?id=${a.id}${requirement ? `&requirement=${requirement}` : ""}`} className="border-btn rounded-2 py-1 px-2 flex-grow-1 text-center">Profile</Link>
                  <button type="button" className={`btn btn-sm ${a.shortlisted ? "btn-warning" : "btn-outline-warning"}`} onClick={() => shortlist(a)} aria-pressed={!!a.shortlisted} title={a.shortlisted ? "Remove from shortlist" : "Shortlist"}>
                    <i className={`bi ${a.shortlisted ? "bi-star-fill" : "bi-star"}`} /><span className="visually-hidden">Shortlist</span>
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setInvite([a])} title="Send engagement request"><i className="bi bi-send-plus" /><span className="visually-hidden">Send request</span></button>
                </div>
              </article>
            ))}
          </div>
          <div className="d-flex justify-content-end mt-3">
            <Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} />
          </div>
        </>
      )}
      {invite && <InviteDialog artists={invite} presetRequirement={requirement} onClose={() => setInvite(null)} onSent={() => { setInvite(null); setPicked({}); }} />}
    </div>
  );
}

type ArtistProfileData = {
  artist: Artist & {
    about: string | null; facts: { label: string; value: string }[]; languages: string[]; links: string[];
    awards: { name: string; year: string | null; description: string | null }[];
    completed_performances: number; average_rating: number | null; ratings: number;
  };
  shortlisted: boolean; shortlist_note: string | null;
  engagements: (MatchState & { requirement_id: number; title: string; reference: string; event_date: string })[];
};

/** /partner/find-artists/view?id= */
export function PartnerArtistView() {
  const params = useSearchParams();
  const id = params.get("id");
  const requirement = params.get("requirement");
  const { data, error, loading, setData } = useApiData<ArtistProfileData>(id ? `/partner/artists/${encodeURIComponent(id)}` : null);
  const [invite, setInvite] = useState(false);
  const back = `/partner/find-artists${requirement ? `?requirement=${requirement}` : ""}`;

  if (!id) return <div className="container-fluid"><PageHeader title="Artist Profile" backHref={back} /><ErrorBox message="No artist selected." /></div>;
  const a = data?.artist;
  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Artist Profile" backHref={back} />
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : a && data && (
        <>
          <section className="oh-card ar-hero compact">
            <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
              <span className="pt-logo">{a.photo ? <img src={a.photo} alt="" /> : <i className={`bi ${TYPE_ICON[a.type_key]}`} aria-hidden="true" />}</span>
              <div className="min-w-0">
                <h2 className="ar-hero-name">{a.name}</h2>
                <div className="ar-hero-meta">
                  <span><i className="bi bi-person-badge" /> {a.type}</span>
                  <span><i className="bi bi-hash" /> {dash(a.regno)}</span>
                  <span><i className="bi bi-geo-alt" /> {a.location || "—"}</span>
                  {a.accredited ? <span className="text-success"><i className="bi bi-patch-check-fill" /> Accredited</span> : <span><i className="bi bi-hourglass-split" /> Under review</span>}
                </div>
              </div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className={`btn rounded-2 ${data.shortlisted ? "btn-warning" : "btn-outline-warning"}`}
                onClick={async () => setData({ ...data, shortlisted: await toggleShortlist(a, !data.shortlisted) })}>
                <i className={`bi ${data.shortlisted ? "bi-star-fill" : "bi-star"} me-1`} />{data.shortlisted ? "Shortlisted" : "Shortlist"}
              </button>
              <button type="button" className="cms-btn rounded-2 py-2 px-3" onClick={() => setInvite(true)}><i className="bi bi-send-plus me-1" />Send Engagement Request</button>
            </div>
          </section>

          <div className="ar-kpis">
            <Kpi icon="bi-flag" label="Completed Performances" value={a.completed_performances} tone="ok" />
            <Kpi icon="bi-star" label={a.average_rating ? `Average rating ${a.average_rating}/5` : "No ratings yet"} value={a.ratings} />
            <Kpi icon="bi-send-check" label="Your Engagements" value={data.engagements.length} />
          </div>

          <div className="row g-3">
            <div className="col-lg-8">
              <Panel icon="bi-person-lines-fill" title="About">
                {a.about ? <p className="bk-pre mb-3">{a.about}</p> : <p className="text-muted">No description yet.</p>}
                <dl className="ar-dl">
                  <div><dt>Art Forms</dt><dd>{a.art_forms.join(", ") || "—"}</dd></div>
                  <div><dt>Languages</dt><dd>{a.languages.join(", ") || "—"}</dd></div>
                  {a.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
                </dl>
              </Panel>
              {a.links.length > 0 && (
                <Panel icon="bi-collection-play" title="Portfolio">
                  <ul className="pt-links">{a.links.map((l) => <li key={l}><a href={l} target="_blank" rel="noopener noreferrer"><i className="bi bi-box-arrow-up-right me-1" />{l}</a></li>)}</ul>
                </Panel>
              )}
              {a.awards.length > 0 && (
                <Panel icon="bi-award" title="Awards & Recognition">
                  <ul className="pt-list">{a.awards.map((w, i) => <li key={i}><b>{w.name}</b><span>{[w.year, w.description].filter(Boolean).join(" · ")}</span></li>)}</ul>
                </Panel>
              )}
            </div>
            <div className="col-lg-4">
              <Panel icon="bi-telephone" title="Contact">
                {a.mobile || a.email ? (
                  <div className="bk-contact">
                    {a.mobile && <a href={`tel:+91${a.mobile}`}><i className="bi bi-telephone" aria-hidden="true" /> {a.mobile}</a>}
                    {a.email && <a href={`mailto:${a.email}`}><i className="bi bi-envelope" aria-hidden="true" /> {a.email}</a>}
                  </div>
                ) : <p className="small text-muted mb-0">Contact details are shared once the artist accepts one of your engagement requests.</p>}
              </Panel>
              <Panel icon="bi-clock-history" title="Your Engagements">
                {!data.engagements.length ? <p className="small text-muted mb-0">None yet.</p> : (
                  <ul className="pt-list">
                    {data.engagements.map((e) => (
                      <li key={e.match_id}>
                        <Link href={`/partner/requirements/view?id=${e.requirement_id}`}><b>{e.title}</b></Link>
                        <span>{formatDate(e.event_date)} · {e.booking_status ? <span className={`badge ${BOOKING_BADGE[e.booking_status]}`}>{e.booking_label}</span> : <span className={`badge ${INTEREST_BADGE[e.interest]}`}>{e.interest_label}</span>}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
          {invite && <InviteDialog artists={[a]} presetRequirement={requirement} onClose={() => setInvite(false)} onSent={() => setInvite(false)} />}
        </>
      )}
    </div>
  );
}

/** /partner/shortlist */
export function Shortlist() {
  const { data, error, loading, setData } = useApiData<{ items: (Artist & { note: string | null; shortlisted_at: string })[] }>("/partner/shortlist");
  const [picked, setPicked] = useState<number[]>([]);
  const [invite, setInvite] = useState<Pick<Artist, "id" | "name">[] | null>(null);

  async function remove(a: Artist) {
    if (!(await toggleShortlist(a, false)) && data) {
      setData({ items: data.items.filter((x) => x.id !== a.id) });
      setPicked((p) => p.filter((x) => x !== a.id));
    }
  }

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Shortlisted Artists" />
      <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
        <p className="mb-0 text-muted">Artists you shortlisted from Search Artists. Select several to send them an engagement request together.</p>
        <div className="d-flex gap-2">
          <Link href="/partner/find-artists" className="border-btn rounded-2 py-2 px-3"><i className="bi bi-search me-1" />Search Artists</Link>
          <button type="button" className="cms-btn rounded-2 py-2 px-3" disabled={!picked.length}
            onClick={() => setInvite((data?.items ?? []).filter((a) => picked.includes(a.id)))}><i className="bi bi-send-plus me-1" />Send Request ({picked.length})</button>
        </div>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : !data?.items.length ? (
        <div className="ar-empty"><i className="bi bi-star" aria-hidden="true" /><p>No shortlisted artists yet.</p></div>
      ) : (
        <div className="table-responsive">
          <table className="table table-bordered table-striped align-middle">
            <thead><tr><th className="bk-col-sno"><span className="visually-hidden">Select</span></th><th>Artist</th><th>Art Forms</th><th>Location</th><th>Shortlisted</th><th className="bk-col-action">Action</th></tr></thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td><input type="checkbox" className="form-check-input" aria-label={`Select ${a.name}`} checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} /></td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <Avatar src={a.photo} icon={TYPE_ICON[a.type_key]} />
                      <div><Link href={`/partner/find-artists/view?id=${a.id}`}><b>{a.name}</b></Link><small className="d-block text-muted">{a.type}{a.note ? ` · ${a.note}` : ""}</small></div>
                    </div>
                  </td>
                  <td className="small">{a.art_forms.join(", ") || "—"}</td>
                  <td className="small">{a.location || "—"}</td>
                  <td className="small">{formatDate(a.shortlisted_at)}</td>
                  <td className="text-nowrap">
                    <button type="button" className="btn btn-sm btn-outline-success me-1" title="Send engagement request" onClick={() => setInvite([a])}><i className="bi bi-send-plus" /><span className="visually-hidden">Send request</span></button>
                    <button type="button" className="btn btn-sm btn-outline-danger" title="Remove" onClick={() => remove(a)}><i className="bi bi-trash" /><span className="visually-hidden">Remove</span></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {invite && <InviteDialog artists={invite} onClose={() => setInvite(null)} onSent={() => { setInvite(null); setPicked([]); }} />}
    </div>
  );
}

// ================================================================ engagements / bookings

type EngRow = MatchState & {
  requirement_id: number; title: string; reference: string; event_date: string; requirement_status?: string; venue?: string; media_count?: number;
  artist: (Pick<Artist, "id" | "name" | "type" | "regno" | "location" | "art_forms" | "photo"> & { email?: string; mobile?: string }) | null;
};

function ArtistCell({ a }: { a: EngRow["artist"] }) {
  if (!a) return <>—</>;
  return (
    <div className="d-flex align-items-center gap-2">
      <Avatar src={a.photo} />
      <div className="min-w-0">
        <Link href={`/partner/find-artists/view?id=${a.id}`}><b>{a.name}</b></Link>
        <small className="d-block text-muted">{a.type}</small>
        {a.mobile && <a href={`tel:+91${a.mobile}`} className="small d-block"><i className="bi bi-telephone me-1" />{a.mobile}</a>}
      </div>
    </div>
  );
}

/** /partner/engagements */
export function EngagementList() {
  const [status, setStatus] = useState<"all" | "awaiting" | "accepted" | "declined" | "booked">("all");
  const [source, setSource] = useState("invited");
  const [requirementId, setRequirementId] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams(Object.entries({ status, source, requirement_id: requirementId, page: String(page) }).filter(([, v]) => v));
  const { data, error, loading } = useApiData<{ items: EngRow[]; meta: Meta; counts: Record<string, number>; opportunities: { id: number; title: string; reference: string }[] }>(`/partner/engagements?${qs}`);

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Engagement Requests" />
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <StatusTabs tabs={[["all", "All"], ["awaiting", "Awaiting Reply"], ["accepted", "Accepted"], ["declined", "Declined"], ["booked", "Booked"]]} active={status} counts={data?.counts as Partial<Record<typeof status, number>>} onChange={(k) => { setStatus(k); setPage(1); }} />
        <div className="d-flex flex-wrap gap-2">
          <select className="form-select" aria-label="Request type" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
            <option value="invited">Requests I sent</option>
            <option value="matched">Matched (public) responses</option>
            <option value="all">Everything</option>
          </select>
          <select className="form-select" aria-label="Opportunity" value={requirementId} onChange={(e) => { setRequirementId(e.target.value); setPage(1); }}>
            <option value="">All opportunities</option>
            {data?.opportunities.map((o) => <option key={o.id} value={o.id}>{o.title} ({o.reference})</option>)}
          </select>
        </div>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead><tr><th>Artist</th><th>Opportunity</th><th>Sent / Matched</th><th>Response</th><th>Booking</th><th className="bk-col-view">View</th></tr></thead>
              <tbody>
                {!data?.items.length ? <tr><td colSpan={6} className="text-center py-4">Nothing here yet.</td></tr> : data.items.map((m) => (
                  <tr key={m.match_id}>
                    <td><ArtistCell a={m.artist} /></td>
                    <td><b className="d-block">{m.title}</b><small className="text-muted">{m.reference} · {formatDate(m.event_date)}</small></td>
                    <td className="small">{m.invited ? `Request ${formatDate(m.invited_at)}` : "Matched"}</td>
                    <td><span className={`badge ${INTEREST_BADGE[m.interest]}`}>{m.interest_label}</span>{m.interest_note && <small className="d-block text-muted mt-1">“{m.interest_note}”</small>}</td>
                    <td>{m.booking_status ? <span className={`badge ${BOOKING_BADGE[m.booking_status]}`}>{m.booking_label}</span> : "—"}</td>
                    <td><Link href={`/partner/requirements/view?id=${m.requirement_id}`} className="btn btn-sm btn-outline-info" title="Open opportunity"><i className="bi bi-eye" /><span className="visually-hidden">Open opportunity</span></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <div className="d-flex justify-content-end mt-2"><Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} /></div>}
        </>
      )}
    </div>
  );
}

/** /partner/partner-bookings */
export function PartnerBookings() {
  const [status, setStatus] = useState<"all" | "confirmed" | "completed" | "cancelled">("all");
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApiData<{ items: EngRow[]; meta: Meta; counts: Record<string, number> }>(`/partner/bookings?status=${status}&page=${page}`);

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Bookings & Engagement History" />
      <p className="text-muted">Confirmed, completed and cancelled bookings. Open an opportunity to mark a booking completed, give feedback or add event photos and videos.</p>
      <div className="mb-3">
        <StatusTabs tabs={[["all", "All"], ["confirmed", "Confirmed"], ["completed", "Completed"], ["cancelled", "Cancelled"]]} active={status} counts={data?.counts as Partial<Record<typeof status, number>>} onChange={(k) => { setStatus(k); setPage(1); }} />
      </div>
      <ErrorBox message={error} />
      {loading && !data ? <Loader /> : (
        <>
          <div className="table-responsive">
            <table className="table table-bordered table-striped align-middle">
              <thead><tr><th>Artist</th><th>Event</th><th>Confirmed</th><th>Status</th><th>Feedback</th><th>Media</th><th className="bk-col-view">View</th></tr></thead>
              <tbody>
                {!data?.items.length ? <tr><td colSpan={7} className="text-center py-4">No bookings yet.</td></tr> : data.items.map((m) => (
                  <tr key={m.match_id}>
                    <td><ArtistCell a={m.artist} /></td>
                    <td><b className="d-block">{m.title}</b><small className="text-muted">{formatDate(m.event_date)}{m.venue ? ` · ${m.venue}` : ""}</small></td>
                    <td className="small">{m.confirmed_via_label ?? "—"}<br />{formatDate(m.confirmed_on)}{m.agreed_fee && <span className="d-block text-muted">{m.agreed_fee}</span>}</td>
                    <td>{m.booking_status && <span className={`badge ${BOOKING_BADGE[m.booking_status]}`}>{m.booking_label}</span>}</td>
                    <td>{m.rating ? <Stars value={m.rating} /> : m.booking_status === "completed" ? <small className="text-muted">Pending</small> : "—"}</td>
                    <td className="small">{m.media_count ? `${m.media_count} item(s)` : "—"}</td>
                    <td><Link href={`/partner/requirements/view?id=${m.requirement_id}`} className="btn btn-sm btn-outline-info" title="Open opportunity"><i className="bi bi-eye" /><span className="visually-hidden">Open opportunity</span></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <div className="d-flex justify-content-end mt-2"><Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} /></div>}
        </>
      )}
    </div>
  );
}

// ================================================================ reports

type ReportData = {
  totals: Record<"opportunities" | "artists_reached" | "requests_sent" | "accepted" | "declined" | "bookings" | "completed" | "cancelled", number> & { average_rating: number | null };
  by_status: Record<string, number>;
  by_art_form: { name: string | null; c: number }[];
  by_category: { name: string | null; c: number }[];
  trend: { month: string; bookings: number }[];
  opportunities: Requirement[];
};

export function BarList({ rows, total }: { rows: { name: string | null; value: number }[]; total?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="oh-empty">No data yet.</p>;
  return (
    <ul className="pt-bars">
      {rows.map((r, i) => (
        <li key={`${r.name}-${i}`}>
          <span className="pt-bar-label">{r.name ?? "Not given"}</span>
          <span className="pt-bar-track"><span className={`pt-bar-fill pt-w-${Math.max(10, Math.round((r.value / max) * 10) * 10)}`} /></span>
          <b>{r.value.toLocaleString("en-IN")}{total ? <small className="text-muted"> ({Math.round((r.value / Math.max(total, 1)) * 100)}%)</small> : null}</b>
        </li>
      ))}
    </ul>
  );
}

/** /partner/partner-reports */
export function PartnerReports() {
  const { data, error, loading } = useApiData<ReportData>("/partner/reports");
  if (loading && !data) return <Loader />;
  if (!data) return <ErrorBox message={error ?? "Unable to load the report."} />;
  const t = data.totals;
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

  function exportCsv() {
    downloadCsv("engagement-report.csv",
      ["Reference", "Title", "Category", "Art Form", "Event Date", "Status", "Artists Reached", "Requests Sent", "Accepted", "Declined", "Booked"],
      data!.opportunities.map((r) => [r.reference, r.title, r.programme_type ?? "", r.art_form ?? "", r.event_date, r.status_label,
        r.stats?.matched ?? 0, r.stats?.invited ?? 0, r.stats?.interested ?? 0, r.stats?.declined ?? 0, r.stats?.booked ?? 0]));
  }

  return (
    <div className="container-fluid ar-page">
      <PageHeader title="Engagement Reports" />
      <div className="d-flex justify-content-end mb-2">
        <button type="button" className="border-btn rounded-2 py-2 px-3" onClick={exportCsv}><i className="bi bi-download me-1" />Export CSV</button>
      </div>
      <div className="ar-kpis">
        <Kpi icon="bi-megaphone" label="Opportunities" value={t.opportunities} />
        <Kpi icon="bi-people" label="Artists Reached" value={t.artists_reached} />
        <Kpi icon="bi-send-check" label="Requests Sent" value={t.requests_sent} />
        <Kpi icon="bi-hand-thumbs-up" label="Accepted / Interested" value={t.accepted} tone="ok" />
        <Kpi icon="bi-calendar2-check" label="Bookings" value={t.bookings} tone="warn" />
        <Kpi icon="bi-flag" label={t.average_rating ? `Completed · avg ${t.average_rating}★` : "Completed"} value={t.completed} tone="ok" />
      </div>
      <div className="oh-row-2">
        <Panel icon="bi-bar-chart" title="Bookings by Month (event date)">
          <BarList rows={data.trend.map((r) => ({ name: monthLabel(r.month), value: r.bookings }))} />
        </Panel>
        <Panel icon="bi-palette" title="Opportunities by Art Form">
          <BarList rows={data.by_art_form.map((r) => ({ name: r.name, value: r.c }))} total={t.opportunities} />
        </Panel>
      </div>
      <div className="oh-row-2">
        <Panel icon="bi-tags" title="Opportunities by Category">
          <BarList rows={data.by_category.map((r) => ({ name: r.name, value: r.c }))} total={t.opportunities} />
        </Panel>
        <Panel icon="bi-list-check" title="Opportunities by Status">
          <BarList rows={Object.entries(data.by_status).map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: Number(v) }))} total={t.opportunities} />
        </Panel>
      </div>
      <Panel icon="bi-table" title="All Opportunities">
        <div className="table-responsive">
          <table className="table table-bordered table-striped align-middle">
            <thead><tr><th>Opportunity</th><th>Event Date</th><th>Status</th><th>Reached</th><th>Requests</th><th>Accepted</th><th>Booked</th></tr></thead>
            <tbody>
              {!data.opportunities.length ? <tr><td colSpan={7} className="text-center py-3">No opportunities yet.</td></tr> : data.opportunities.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/partner/requirements/view?id=${r.id}`}><b>{r.title}</b></Link><small className="d-block text-muted">{r.reference}</small></td>
                  <td className="small">{dateRange(r)}</td>
                  <td>{r.status_label}</td>
                  <td>{r.stats?.matched ?? 0}</td><td>{r.stats?.invited ?? 0}</td><td>{r.stats?.interested ?? 0}</td><td>{r.stats?.booked ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
