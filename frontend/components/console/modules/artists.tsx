"use client";

// Artist Management -> Artist Registration
// List: backend/views/backend/artist/list.blade.php (server-side pagination, 15/page)
// Preview: artist/preview.blade.php with Approve / Reject for pending registrations.
/* eslint-disable @next/next/no-img-element -- uploads are served by the Laravel host */
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { http } from "@/lib/api/http";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import { dash, formatDate } from "../crud/common";
import { Pagination } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader, SuccessBox } from "../ui/PageHeader";
import { confirmAction, failure, promptText, success } from "../ui/alerts";
import { useFlash } from "../ui/flash";

const TYPES = { individual: "Individual Artist", group: "Artist Group", institutional: "Institute / Organization" } as const;
const STATUSES = { "0": "Pending", "1": "Approved", "2": "Rejected" } as const;

function statusBadge(s: number | null) {
  const label = s === null ? "Not Tracked" : STATUSES[String(s) as keyof typeof STATUSES] ?? "Not Tracked";
  const cls = s === 0 ? "bg-warning text-dark" : s === 1 ? "bg-success" : s === 2 ? "bg-danger" : "bg-secondary";
  return <span className={`badge ${cls}`}>{label}</span>;
}

type ArtistRow = {
  user_id: number;
  regno: string;
  registration_type_label: string;
  display_name: string | null;
  country_name: string | null;
  email: string | null;
  mobile: string | null;
  verified_status: number | null;
  submitted_at: string | null;
};
type ListData = { items: ArtistRow[]; meta: { current_page: number; last_page: number; total: number; from: number | null; to: number | null } };

type Filters = { registration_type: string; registration_status: string; search: string };
const EMPTY: Filters = { registration_type: "", registration_status: "", search: "" };

/** /admin/artist - wrap in <Suspense> (dashboard cards link here with ?registration_status=). */
export function ArtistList() {
  const sp = useSearchParams();
  const { can } = useConsole();
  const [flash, clearFlash] = useFlash();
  const initial: Filters = { ...EMPTY, registration_status: sp.get("registration_status") ?? "" };
  const [form, setForm] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams(Object.entries({ ...applied, page: String(page) }).filter(([, v]) => v !== ""));
  const { data, error, loading } = useApiData<ListData>(`/artists?${qs}`);
  const canEdit = can("/artist", "edit");

  return (
    <div className="container-fluid artist-registration-list">
      <PageHeader title="Artist Registration Management" />
      <SuccessBox message={flash} onClose={clearFlash} />
      <ErrorBox message={error} />

      <div className="row mb-3">
        <div className="col-12">
          <div className="bg-light border rounded-3 shadow-sm p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setApplied(form);
                setPage(1);
              }}
            >
              <div className="row align-items-end">
                <div className="col-lg-3 col-md-6 mb-3">
                  <label className="form-label fw-bold" htmlFor="registration_type">Registration Type</label>
                  <select className="form-select" id="registration_type" value={form.registration_type} onChange={(e) => setForm({ ...form, registration_type: e.target.value })}>
                    <option value="">All</option>
                    {Object.entries(TYPES).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="col-lg-3 col-md-6 mb-3">
                  <label className="form-label fw-bold" htmlFor="registration_status">Registration Status</label>
                  <select className="form-select" id="registration_status" value={form.registration_status} onChange={(e) => setForm({ ...form, registration_status: e.target.value })}>
                    <option value="">All</option>
                    {Object.entries(STATUSES).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="col-lg-3 col-md-6 mb-3">
                  <label className="form-label fw-bold" htmlFor="search">Search</label>
                  <input className="form-control" type="search" id="search" maxLength={255} value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="Registration number, name, email or mobile" />
                </div>
                <div className="col-lg-2 col-md-6 mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <button type="submit" className="theme-btn rounded-2 py-2 px-4">Search</button>
                    <button
                      type="button"
                      className="border-btn rounded-2 py-2 px-3"
                      onClick={() => {
                        setForm(EMPTY);
                        setApplied(EMPTY);
                        setPage(1);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="row py-2">
        <div className="col-12">
          {loading && !data ? (
            <Loader />
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-bordered table-striped align-middle">
                  <thead>
                    <tr>
                      <th style={{ width: "5%" }}>S.No.</th>
                      <th style={{ width: "23%" }}>Registration Number / <br />Registration Type</th>
                      <th style={{ width: "20%" }}>Artist / Group / <br />Institution Name</th>
                      <th style={{ width: "15%" }}>Email / Mobile</th>
                      <th style={{ width: "7%" }}>Status</th>
                      <th style={{ width: "8%" }}>Submission Date</th>
                      <th style={{ width: "8%" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!data?.items.length ? (
                      <tr>
                        <td colSpan={8} className="text-center py-4">No artist registrations found.</td>
                      </tr>
                    ) : (
                      data.items.map((a, i) => (
                        <tr key={a.user_id}>
                          <td>{(data.meta.from ?? 1) + i}</td>
                          <td>{a.regno}<br />{a.registration_type_label}</td>
                          <td>{dash(a.display_name)}</td>
                          <td>
                            <span className="d-block">{dash(a.email)}</span>
                            <small className="text-muted">{dash(a.mobile)}</small>
                          </td>
                          <td>{statusBadge(a.verified_status)}</td>
                          <td>{formatDate(a.submitted_at)}</td>
                          <td className="text-nowrap">
                            <Link href={`/admin/artist/preview?id=${a.user_id}`} className="btn btn-sm btn-outline-info" title="Preview" aria-label="Preview registration">
                              <i className="bi bi-eye" />
                            </Link>
                            {canEdit && a.verified_status === 0 && (
                              <span className="ms-1 badge bg-light text-dark border" title="Pending review">Review</span>
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
                  <small className="text-muted">
                    Showing {data.meta.from ?? 0}–{data.meta.to ?? 0} of {data.meta.total}
                  </small>
                  <Pagination current={data.meta.current_page} pages={data.meta.last_page} onPage={setPage} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Preview ------------------------------------------------------------
type Detail = Record<string, unknown> & { [k: string]: unknown };
type PreviewData = {
  artist: Detail;
  type: keyof typeof TYPES;
  type_label: string;
  individual: Detail | null;
  group: Detail | null;
  institution: Detail | null;
  country: string | null;
  region: string | null;
  artForms: Record<string, string>;
  awards: (Detail & { award_name?: string; award_year?: number; certificate_url?: string | null; description?: string })[];
  portfolioLinks: string[];
  languages: string[];
  rejectionReason: string | null;
  approvalRemarks: string | null;
  state_name?: string | null;
  district_name?: string | null;
  can_change_status: boolean;
};

// users.gender codes (4-6 come from the artist's My Profile form).
const GENDERS: Record<string, string> = { "1": "Male", "2": "Female", "3": "Others", "4": "Transgender", "5": "Non-binary", "6": "Prefer not to say" };

function FileLink({ url, label }: { url: unknown; label: string }) {
  return url ? (
    <a href={String(url)} target="_blank" rel="noopener noreferrer" className="view">
      <i className="bi bi-file-earmark-arrow-down me-1" />
      {label}
    </a>
  ) : (
    <>—</>
  );
}

/** /admin/artist/preview?id=12 - wrap in <Suspense>. */
export function ArtistPreview() {
  const id = Number(useSearchParams().get("id")) || 0;
  const { data, error, loading, reload } = useApiData<PreviewData>(id ? `/artists/${id}` : null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Loader />;
  if (!data) {
    return (
      <div className="container-fluid">
        <PageHeader title="Artist Registration Preview" backHref="/admin/artist" />
        <ErrorBox message={error ?? "Registration not found."} />
      </div>
    );
  }

  const a = data.artist;
  const d = (data.individual ?? data.group ?? data.institution ?? {}) as Detail;
  const artForms = Object.values(data.artForms ?? {}).join(", ");
  const photo = d.profile_photo_url ?? d.institution_logo_url;

  const decide = async (status: "approved" | "rejected") => {
    let remarks: string | null = "";
    if (status === "rejected") {
      remarks = await promptText("Reject registration", "Reason for rejection (sent to the applicant)", true);
      if (remarks === null) return;
    } else if (!(await confirmAction("Approve registration?", "The applicant will be marked as an approved artist.", "Yes, approve"))) {
      return;
    }
    setBusy(true);
    try {
      const res = await http.patch(`/artists/${id}/status`, { status, remarks });
      await success(res.message);
      reload();
    } catch (e) {
      await failure(e);
    } finally {
      setBusy(false);
    }
  };

  const common: [string, React.ReactNode][] = [
    ["Registration Number", dash(a.regno)],
    ["Registration Type", data.type_label],
    ["Status", statusBadge(a.verified_status === null ? null : Number(a.verified_status))],
    ["State / UT", dash(data.state_name ?? data.region)],
    ...(data.district_name ? ([["District", data.district_name]] as [string, React.ReactNode][]) : []),
    ["City / Town / Village", dash(a.city)],
    ["Email", dash(a.email)],
    ["Phone", dash(a.mobile)],
    ["Mailing Address", [a.address, a.pincode].filter(Boolean).join(", ") || "—"],
    ["Languages", data.languages?.length ? data.languages.join(", ") : "—"],
    ["Art Forms", artForms || "—"],
  ];

  const specific: [string, React.ReactNode][] =
    data.type === "individual"
      ? [
          ["Full Name", dash(a.full_name)],
          ["Stage Name", dash(d.stage_name)],
          ["Date of Birth", formatDate(a.dob)],
          ["Gender", GENDERS[String(a.gender)] ?? "—"],
          ["Other Art Form", dash(d.other_art_form)],
          ["Other Subgenre", dash(d.other_subgenre)],
          ["Art Form Details / Tradition", dash(d.art_tradition)],
          ["Years of Practice", dash(d.years_of_practice)],
          ["Teacher / Guru", dash(d.teacher_guru)],
          ["Institutional Affiliation", dash(d.institutional_affiliation)],
          ["Public Profile", d.public_profile ? "Yes" : "No"],
          ["Biography", dash(d.biography)],
          ["Identity Document", <FileLink key="id" url={d.identity_document_url} label="View document" />],
        ]
      : data.type === "group"
        ? [
            ["Group Name", dash(d.group_name)],
            ["Representative", `${dash(a.full_name)}${a.designation ? ` (${a.designation})` : ""}`],
            ["Group Type", `${dash(d.group_type)}${d.other_group_type ? ` – ${d.other_group_type}` : ""}`],
            ["Establishment Year", dash(d.establishment_year)],
            ["Registration Number", dash(d.registration_number)],
            ["Total Members", dash(d.total_members)],
            ["Other Art Form", dash(d.other_art_form)],
            ["Description", dash(d.group_description)],
            ["Public Profile", d.public_profile ? "Yes" : "No"],
            ["Identity / Authorisation Document", <FileLink key="id" url={d.identity_document_url} label="View document" />],
          ]
        : [
            ["Institution Name", dash(d.institution_name)],
            ["Representative", `${dash(a.full_name)}${a.designation ? ` (${a.designation})` : ""}`],
            ["Institution Type", `${dash(d.institution_type)}${d.other_institution_type ? ` – ${d.other_institution_type}` : ""}${d.sub_category ? ` (${d.sub_category})` : ""}`],
            ["Hosts Cultural Programmes", d.hosts_programmes ? String(d.hosts_programmes).replace(/^\w/, (c) => c.toUpperCase()) : "—"],
            ["Types of Programmes", dash(d.programme_types)],
            ["Typical Audience Size", dash(d.audience_size)],
            ["Venue Availability", dash(d.venue_availability)],
            ["Venue Types", dash(d.venue_types)],
            ["Venue Facilities", dash(d.venue_facilities)],
            ["Venue Locations", dash(d.venue_locations)],
            ["Public Profile", d.public_profile ? "Yes" : "No"],
            ["Establishment Year", dash(d.establishment_year)],
            ["Registration Type / Number", [d.institution_registration_type, d.registration_number].filter(Boolean).join(" / ") || "—"],
            ["Website", d.website ? <a href={String(d.website)} target="_blank" rel="noopener noreferrer">{String(d.website)}</a> : "—"],
            ["Associated Artists", dash(d.associated_artists)],
            ["Description", dash(d.institution_description)],
            ["Cultural Activities", dash(d.cultural_activities)],
            ["Training / Research", dash(d.training_research_activities)],
            ["Major Events", dash(d.major_events)],
            ["Collaborations", dash(d.collaborations)],
            ["Authorization Letter", <FileLink key="al" url={d.authorization_letter_url} label="View letter" />],
            ["Registration Certificate", <FileLink key="rc" url={d.registration_certificate_url} label="View certificate" />],
            ["Brochure", <FileLink key="br" url={d.brochure_path_url} label="View brochure" />],
            ["Organisation Logo", <FileLink key="lg" url={d.institution_logo_url} label="View logo" />],
            ["Identity Document", <FileLink key="id" url={d.identity_document_url} label="View document" />],
          ];

  const docs = (d.supporting_document_urls ?? d.supporting_documents_urls) as string[] | undefined;

  return (
    <div className="container-fluid">
      <PageHeader title="Artist Registration Preview" backHref="/admin/artist" />

      {data.rejectionReason && Number(a.verified_status) === 2 && (
        <div className="alert alert-danger"><b>Rejection reason:</b> {data.rejectionReason}</div>
      )}
      {data.approvalRemarks && Number(a.verified_status) === 1 && (
        <div className="alert alert-success"><b>Approval remarks:</b> {data.approvalRemarks}</div>
      )}

      <div className="row">
        <div className="col-lg-9">
          <div className="table-responsive">
            <table className="table table-bordered preview-data">
              <tbody>
                {[...specific, ...common].map(([k, v]) => (
                  <tr key={k}>
                    <th className="bg-light" style={{ width: "30%" }}>{k}</th>
                    <td style={{ whiteSpace: "pre-line" }}>{v}</td>
                  </tr>
                ))}
                {docs && docs.length > 0 && (
                  <tr>
                    <th className="bg-light">Supporting Documents</th>
                    <td>{docs.map((u, i) => <div key={u}><FileLink url={u} label={`Document ${i + 1}`} /></div>)}</td>
                  </tr>
                )}
                {data.portfolioLinks?.length > 0 && (
                  <tr>
                    <th className="bg-light">Portfolio Links</th>
                    <td>{data.portfolioLinks.map((l) => <div key={l}><a href={l} target="_blank" rel="noopener noreferrer">{l}</a></div>)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data.awards?.length > 0 && (
            <>
              <h2 className="fw-bold mt-4 mb-2">Awards</h2>
              <table className="table table-bordered preview-data">
                <thead>
                  <tr><th>Award</th><th>Year</th><th>Description</th><th>Certificate</th></tr>
                </thead>
                <tbody>
                  {data.awards.map((aw, i) => (
                    <tr key={i}>
                      <td>{dash(aw.award_name)}</td>
                      <td>{dash(aw.award_year)}</td>
                      <td>{dash(aw.description)}</td>
                      <td><FileLink url={aw.certificate_url} label="View" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="col-lg-3">
          <div className="border rounded-3 p-3 text-center bg-light">
            {photo ? (
              <img src={String(photo)} alt="Profile" className="img-fluid rounded mb-2" style={{ maxHeight: 220, objectFit: "cover" }} />
            ) : (
              <i className="bi bi-person-square text-secondary" style={{ fontSize: "5rem" }} aria-hidden="true" />
            )}
            <div className="fw-bold">{dash(d.group_name ?? d.institution_name ?? a.full_name)}</div>
            <small className="text-muted">{data.type_label}</small>
          </div>

          {data.can_change_status && (
            <div className="d-grid gap-2 mt-3">
              <button type="button" className="btn btn-success" disabled={busy} onClick={() => decide("approved")}>
                <i className="bi bi-check-lg me-1" /> Approve
              </button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => decide("rejected")}>
                <i className="bi bi-x-lg me-1" /> Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
