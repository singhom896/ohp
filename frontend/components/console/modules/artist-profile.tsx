"use client";

// After-login "My Profile" for artist accounts (/artist/profile).
// One form per account type, following the Opportunity Hub form sheets:
//   role 5 Individual Artist, role 6 Artist Group, role 7 Organisation / Institute.
// API: GET/POST /artist/profile (backend ArtistProfileController). The email is
// the verified login and is read-only; the password has its own page.
/* eslint-disable @next/next/no-img-element -- uploads are served by the Laravel host */
import { useMemo, useRef, useState } from "react";
import { http } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/context/AuthContext";
import { useApiData } from "../crud/useApi";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { confirmAction, failure, success } from "../ui/alerts";
import Link from "next/link";
import { FileInput, SelectInput, TextArea, TextInput, toOptions, type Option } from "../ui/fields";

// ------------------------------------------------------------------ types

type ProfileType = "individual" | "group" | "organisation";
type Values = Record<string, string | boolean | (string | number)[]>;
type IdName = { id: number; name: string };
type Doc = { path: string; name: string; url: string | null };
type Award = { key: string; ref?: string; name: string; year: string; description: string; certificate_url?: string | null; file?: File | null };

type Payload = {
  type: ProfileType;
  type_label: string;
  regno: string | null;
  email: string;
  email_verified?: boolean;
  mobile_verified?: boolean;
  verified_status: number | null;
  changes_requested?: string | null;
  profile_completed: boolean;
  mode: "direct" | "request";
  locked: boolean;
  pending: { id: number; number: number; submitted_at: string | null } | null;
  draft: { id: number; number: number; updated_at: string | null } | null;
  rejected: { number: number; remarks: string | null } | null;
  initial_rejection: string | null;
  values: Values;
  files: Record<string, string | null | Doc[]>;
  awards: Omit<Award, "key">[];
  options: {
    states: IdName[];
    districts: (IdName & { state_id: number })[];
    languages: IdName[];
    art_forms: IdName[];
    sub_art_forms?: (IdName & { parent_id: number })[];
    genders?: Option[];
    group_types?: IdName[];
    representative_roles?: string[];
    categories?: Record<string, string[]>;
    registration_required?: string[];
    hosts_programmes?: Option[];
    programme_types?: string[];
    audience_sizes?: string[];
    venue_availability?: string[];
    venue_types?: string[];
    venue_facilities?: string[];
    designations?: string[];
    award_suggestions: string[];
    limits: { links: number; awards: number; documents: number };
  };
};

type Errors = Record<string, string[]>;

const STATUS: Record<number, [string, string, string]> = {
  0: ["Pending approval", "bg-warning text-dark", "Your registration is pending approval by your Zonal Cultural Centre. You can keep your profile up to date in the meantime."],
  1: ["Approved", "bg-success", "Your registration is approved."],
  2: ["Rejected", "bg-danger", "Your registration was not approved. Update your details and contact the helpdesk if you need help."],
  3: ["Changes requested", "bg-info text-dark", "Your Zonal Cultural Centre has asked you to update your profile."],
};

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const asList = (v: Values[string] | undefined) => (Array.isArray(v) ? v.map(String) : []);
const asText = (v: Values[string] | undefined) => (typeof v === "string" ? v : "");

// ------------------------------------------------------------ small parts

function Section({ icon, title, hint, children }: { icon: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="ap-section">
      <header className="ap-section-head">
        <i className={`bi ${icon}`} aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      <div className="row g-3">{children}</div>
    </section>
  );
}

function Col({ size = "col-lg-4 col-md-6", children }: { size?: string; children: React.ReactNode }) {
  return <div className={size}>{children}</div>;
}

/** Multi-select as checkbox chips. */
function CheckChips({ name, label, required, options, value, onChange, error, help }: {
  name: string; label: string; required?: boolean; options: Option[]; value: string[];
  onChange: (v: string[]) => void; error?: string; help?: string;
}) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <fieldset className="ap-chips-wrap" aria-invalid={!!error || undefined}>
      <legend className="form-label fw-bold mb-2">
        {label} {required && <sup className="text-danger" aria-hidden="true">*</sup>}
      </legend>
      <div className="ap-chips">
        {options.map((o) => {
          const v = String(o.value);
          const on = value.includes(v);
          return (
            <label key={v} className={`ap-chip${on ? " on" : ""}`}>
              <input type="checkbox" name={`${name}[]`} value={v} checked={on} onChange={() => toggle(v)} />
              {on && <i className="bi bi-check2" aria-hidden="true" />} {o.label}
            </label>
          );
        })}
      </div>
      {help && <small className="text-muted d-block mt-1">{help}</small>}
      {error && <small className="text-danger d-block">{error}</small>}
    </fieldset>
  );
}

function Check({ name, checked, onChange, required, error, children }: {
  name: string; checked: boolean; onChange: (v: boolean) => void; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="ap-check">
      <div className="form-check">
        <input className={`form-check-input${error ? " is-invalid" : ""}`} type="checkbox" id={name} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <label className="form-check-label" htmlFor={name}>
          {children} {required && <sup className="text-danger" aria-hidden="true">*</sup>}
        </label>
      </div>
      {error && <small className="text-danger d-block">{error}</small>}
    </div>
  );
}

function Counter({ value, max, unit = "characters" }: { value: string; max: number; unit?: "characters" | "words" }) {
  const n = unit === "words" ? words(value) : value.length;
  return <small className={`ap-counter${n > max ? " over" : ""}`}>{n} / {max} {unit}</small>;
}

function PhotoField({ name, label, help, current, file, onChange, error, round }: {
  name: string; label: string; help: string; current: string | null; file: File | null;
  onChange: (f: File | null) => void; error?: string; round?: boolean;
}) {
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : current), [file, current]);
  return (
    <div className="ap-photo">
      <div className={`ap-photo-img${round ? " round" : ""}`}>
        {preview ? <img src={preview} alt="" /> : <i className="bi bi-image" aria-hidden="true" />}
      </div>
      <div className="flex-grow-1">
        <FileInput name={name} label={label} icon="bi-camera" accept=".jpg,.jpeg,.png" help={help} error={error} onChange={(f) => onChange(f[0] ?? null)} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------- the page

export function ArtistProfilePage() {
  const { data, setData, error, loading } = useApiData<Payload>("/artist/profile");
  const [version, setVersion] = useState(0);
  if (loading && !data) return <Loader />;
  if (!data) {
    return (
      <div className="container-fluid">
        <PageHeader title="My Profile" />
        <ErrorBox message={error ?? "Unable to load your profile."} />
      </div>
    );
  }
  // Remount the form after a save / reset so it starts from the saved values.
  return (
    <ProfileForm
      key={version}
      data={data}
      onSaved={(p) => { setData(p); setVersion((n) => n + 1); }}
      onReset={() => setVersion((n) => n + 1)}
    />
  );
}

function ProfileForm({ data, onSaved, onReset }: { data: Payload; onSaved: (p: Payload) => void; onReset: () => void }) {
  const { verify } = useAuth();
  const { type, options: o } = data;
  const [v, setV] = useState<Values>(() => ({ ...data.values }));
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [newDocs, setNewDocs] = useState<File[]>([]);
  const [keepDocs, setKeepDocs] = useState<string[]>(() => ((data.files.supporting_documents as Doc[] | undefined) ?? []).map((d) => d.path));
  const [links, setLinks] = useState<{ key: string; url: string }[]>(() => asList(data.values.portfolio_links).map((url) => ({ key: newKey(), url })));
  const [awards, setAwards] = useState<Award[]>(() => data.awards.map((a) => ({ ...a, key: newKey() })));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const set = (k: string) => (val: string | boolean | string[]) => setV((cur) => ({ ...cur, [k]: val }));
  const text = (k: string) => asText(v[k]);
  const list = (k: string) => asList(v[k]);
  const err = (k: string) => errors[k]?.[0];

  // ---- dependent options
  const districts = o.districts.filter((d) => String(d.state_id) === text("state_id"));
  const subArtForms = (o.sub_art_forms ?? []).filter((s) => String(s.parent_id) === text("art_form_id"));
  const groupTypeName = o.group_types?.find((g) => String(g.id) === text("group_type_id"))?.name ?? "";
  const category = text("category");
  const regRequired =
    type === "group" ? groupTypeName.startsWith("Registered") : type === "organisation" ? (o.registration_required ?? []).includes(category) : false;
  const languageOptions = toOptions(o.languages);
  const artFormOptions = toOptions(o.art_forms);
  const strings = (xs?: string[]) => (xs ?? []).map((x) => ({ value: x, label: x }));

  // ---- client-side checks (the server validates everything again)
  function validate(): Errors {
    const e: Errors = {};
    const need = (k: string, label: string) => { if (!text(k).trim()) e[k] = [`${label} is required.`]; };
    const nameOk = (k: string) => { if (text(k).trim() && !/^[\p{L}\p{M}\s.'-]+$/u.test(text(k))) e[k] = ["Use letters, spaces and . ' - only."]; };

    need("full_name", type === "individual" ? "Artist's full name" : type === "group" ? "Representative's full name" : "Contact person name");
    nameOk("full_name");
    if (!/^[6-9]\d{9}$/.test(text("mobile"))) e.mobile = ["Enter a valid 10-digit Indian mobile number."];
    need("state_id", "State / Union Territory");
    need("district_id", "District");
    need("city", type === "individual" ? "City / Town / Village" : "City / Town"); need("pincode", "PIN code");
    if (type !== "individual") { need("address", "Address"); need("designation", "Designation"); }
    if (text("pincode") && !/^[1-9]\d{5}$/.test(text("pincode"))) e.pincode = ["Enter a valid 6-digit PIN code."];
    links.forEach((l, i) => { if (l.url.trim() && !/^https:\/\/\S+\.\S+/.test(l.url.trim())) e[`portfolio_links.${i}`] = ["Use a full https:// link."]; });
    awards.forEach((a, i) => { if (!a.name.trim()) e[`awards.${i}.name`] = ["Enter the award / recognition name."]; });
    if (!v.declaration) e.declaration = ["Please confirm that the information is accurate."];

    if (type === "individual") {
      need("art_form_id", "Primary art category");
      need("subgenre_id", "Specific art form");
      if (text("subgenre_id") === "other") need("other_subgenre", "Art form name");
      need("biography", "Artist introduction");
      if (text("biography").length > 500) e.biography = ["Keep the introduction within 500 characters."];
    } else if (type === "group") {
      need("group_name", "Group name");
      need("group_type_id", "Group type");
      if (groupTypeName === "Other") need("other_group_type", "Group type");
      if (regRequired) need("registration_number", "Group registration number");
      need("total_members", "Total number of members");
      need("primary_art_form_id", "Primary art form");
      need("group_description", "Group description");
      if (words(text("group_description")) > 500) e.group_description = ["Keep the description within 500 words."];
      if (!v.privacy) e.privacy = ["Please accept the data processing consent."];
    } else {
      need("institution_name", "Organisation / institution name");
      need("category", "Organisation category");
      if (regRequired) need("registration_number", "Registration / establishment number");
      need("institution_description", "About the organisation");
      if (words(text("institution_description")) > 500) e.institution_description = ["Keep this within 500 words."];
      if (words(text("major_events")) > 500) e.major_events = ["Keep this within 500 words."];
      need("hosts_programmes", "This answer");
      if (text("hosts_programmes") && text("hosts_programmes") !== "no" && !list("programme_types").length) e.programme_types = ["Select the types of programmes you host."];
      if (!v.authorisation) e.authorisation = ["Please confirm that you are authorised to manage this account."];
      if (!v.privacy) e.privacy = ["Please accept the Privacy Policy / data processing consent."];
    }
    if (type !== "individual" && keepDocs.length + newDocs.length > o.limits.documents) {
      e.supporting_documents = [`You can keep at most ${o.limits.documents} supporting documents.`];
    }
    return e;
  }

  function buildForm(): FormData {
    const fd = new FormData();
    const skip = new Set(["portfolio_links"]);
    for (const [k, val] of Object.entries(v)) {
      if (skip.has(k)) continue;
      if (Array.isArray(val)) val.forEach((x) => fd.append(`${k}[]`, String(x)));
      else if (typeof val === "boolean") { if (val) fd.append(k, "1"); }
      else if (val !== "") fd.append(k, val);
    }
    if (type === "organisation" && text("hosts_programmes") === "no") fd.delete("programme_types[]");
    links.filter((l) => l.url.trim()).forEach((l) => fd.append("portfolio_links[]", l.url.trim()));
    awards.forEach((a, i) => {
      if (a.ref) fd.append(`awards[${i}][ref]`, a.ref);
      fd.append(`awards[${i}][name]`, a.name);
      if (a.year) fd.append(`awards[${i}][year]`, a.year);
      if (a.description) fd.append(`awards[${i}][description]`, a.description);
      if (a.file) fd.append(`awards[${i}][certificate]`, a.file);
    });
    for (const [k, f] of Object.entries(files)) if (f) fd.append(k, f);
    keepDocs.forEach((p) => fd.append("keep_documents[]", p));
    newDocs.forEach((f) => fd.append("supporting_documents[]", f));
    return fd;
  }

  const requestMode = data.mode === "request";
  const locked = data.locked;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = requestMode ? (submitter?.value === "draft" ? "draft" : "submit") : "save";
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      window.setTimeout(() => document.querySelector(".ap-form .text-danger, .ap-form .is-invalid")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      return;
    }
    if (action === "submit" && !(await confirmAction("Submit for approval?", "Your changes will be sent to the ZCC Nodal Officer / Admin for approval. You cannot edit again until a decision is made.", "Yes, submit"))) return;
    setBusy(true);
    try {
      const fd = buildForm();
      fd.append("action", action);
      const res = await http.post<Payload>("/artist/profile", fd);
      await success(res.message, action === "submit" ? "Submitted!" : "Saved!");
      verify(); // refresh the name in the top bar
      onSaved(res.data);
    } catch (ex) {
      if (ex instanceof ApiError && Object.keys(ex.errors).length) {
        setErrors(ex.errors);
        topRef.current?.scrollIntoView({ behavior: "smooth" });
      } else await failure(ex);
    } finally {
      setBusy(false);
    }
  }

  const status = data.verified_status !== null ? STATUS[data.verified_status] : null;
  const serverErrors = Object.values(errors).flat();
  const docs = (data.files.supporting_documents as Doc[] | undefined) ?? [];
  const fileUrl = (k: string) => (typeof data.files[k] === "string" ? (data.files[k] as string) : null);

  // ---- shared sections
  const locationFields = (
    <>
      <Col>
        <SelectInput name="state_id" label="State / Union Territory" icon="bi-map" required value={text("state_id")}
          onChange={(val) => setV((cur) => ({ ...cur, state_id: val, district_id: "" }))} options={toOptions(o.states)} placeholder="Select State / UT" error={err("state_id")} />
      </Col>
      <Col>
        <SelectInput name="district_id" label="District" icon="bi-geo" required value={text("district_id")} onChange={set("district_id")}
          options={toOptions(districts)} placeholder={text("state_id") ? "Select District" : "Select State / UT first"} disabled={!text("state_id")} error={err("district_id")} />
      </Col>
      <Col>
        <TextInput name="city" label={type === "individual" ? "City / Town / Village" : "City / Town"} icon="bi-buildings" required
          value={text("city")} onChange={set("city")} maxLength={100} error={err("city")} />
      </Col>
      <Col>
        <TextInput name="pincode" label="PIN Code" icon="bi-mailbox" inputMode="numeric" required value={text("pincode")}
          onChange={(val) => set("pincode")(val.replace(/\D/g, "").slice(0, 6))} maxLength={6} error={err("pincode")} />
      </Col>
    </>
  );

  const contactFields = (
    <>
      <Col>
        <TextInput name="email" label={type === "organisation" ? "Official Email Address" : "Email Address"} icon="bi-envelope-check" value={data.email}
          onChange={() => undefined} disabled className="bg-input-disabled" help="Verified login email — cannot be changed here." />
      </Col>
      <Col>
        {data.mobile_verified ? (
          // Verified mobile = login identifier: read-only (the API rejects a change too).
          <TextInput name="mobile" label="Mobile Number" icon="bi-phone" required value={text("mobile")}
            onChange={() => undefined} disabled className="bg-input-disabled" error={err("mobile")} help="Verified mobile number — cannot be changed here." />
        ) : (
          <TextInput name="mobile" label="Mobile Number" icon="bi-phone" required inputMode="numeric" value={text("mobile")}
            onChange={(val) => set("mobile")(val.replace(/\D/g, "").slice(0, 10))} maxLength={10} error={err("mobile")} help="10-digit Indian mobile number." />
        )}
      </Col>
    </>
  );

  const linksSection = (
    <Section icon="bi-link-45deg" title={type === "group" ? "Performance / Portfolio Links" : "Performance / Work Sample Links"}
      hint="YouTube, website or any other page that shows your work. Use full https:// links.">
      <div className="col-12">
        {links.map((l, i) => (
          <div key={l.key} className="ap-repeat-row">
            <div className="flex-grow-1">
              <TextInput name={`portfolio_links_${i}`} label={`Link ${i + 1}`} icon="bi-globe2" type="url" placeholder="https://"
                value={l.url} onChange={(url) => setLinks((cur) => cur.map((x) => (x.key === l.key ? { ...x, url } : x)))} error={err(`portfolio_links.${i}`)} />
            </div>
            <button type="button" className="btn btn-outline-danger ap-remove" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks((cur) => cur.filter((x) => x.key !== l.key))}>
              <i className="bi bi-trash" />
            </button>
          </div>
        ))}
        {links.length < o.limits.links && (
          <button type="button" className="border-btn rounded-2 ap-add" onClick={() => setLinks((cur) => [...cur, { key: newKey(), url: "" }])}>
            <i className="bi bi-plus-lg me-1" /> Add link
          </button>
        )}
      </div>
    </Section>
  );

  const awardsSection = (
    <Section icon="bi-trophy" title="Awards & Recognition" hint="Optional. Add each award with its year and certificate, if available.">
      <div className="col-12">
        <datalist id="award-suggestions">{o.award_suggestions.map((n) => <option key={n} value={n} />)}</datalist>
        {awards.map((a, i) => {
          const upd = (patch: Partial<Award>) => setAwards((cur) => cur.map((x) => (x.key === a.key ? { ...x, ...patch } : x)));
          return (
            <div key={a.key} className="ap-award">
              <div className="ap-award-head">
                <b>Award {i + 1}</b>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setAwards((cur) => cur.filter((x) => x.key !== a.key))}>
                  <i className="bi bi-trash me-1" /> Remove
                </button>
              </div>
              <div className="row g-3">
                <Col size="col-lg-6">
                  <TextInput name={`award_name_${i}`} label="Award / Recognition Name" icon="bi-award" required list="award-suggestions" value={a.name}
                    onChange={(name) => upd({ name })} maxLength={255} error={err(`awards.${i}.name`)} />
                </Col>
                <Col size="col-lg-2 col-md-4">
                  <TextInput name={`award_year_${i}`} label="Award Year" icon="bi-calendar" inputMode="numeric" placeholder="YYYY" value={a.year}
                    onChange={(year) => upd({ year: year.replace(/\D/g, "").slice(0, 4) })} error={err(`awards.${i}.year`)} />
                </Col>
                <Col size="col-lg-4 col-md-8">
                  <FileInput name={`award_certificate_${i}`} label="Certificate" accept=".pdf,.jpg,.jpeg,.png" help="PDF/JPG/PNG, max 2 MB."
                    currentUrl={a.certificate_url} currentLabel="View current certificate" error={err(`awards.${i}.certificate`)} onChange={(f) => upd({ file: f[0] ?? null })} />
                </Col>
                <div className="col-12">
                  <TextArea name={`award_description_${i}`} label="Description" rows={2} maxLength={500} value={a.description}
                    onChange={(description) => upd({ description })} error={err(`awards.${i}.description`)} />
                  <Counter value={a.description} max={500} />
                </div>
              </div>
            </div>
          );
        })}
        {awards.length < o.limits.awards && (
          <button type="button" className="border-btn rounded-2 ap-add"
            onClick={() => setAwards((cur) => [...cur, { key: newKey(), name: "", year: "", description: "" }])}>
            <i className="bi bi-plus-lg me-1" /> Add award
          </button>
        )}
      </div>
    </Section>
  );

  const documentsField = (
    <div className="col-12">
      <FileInput name="supporting_documents" label="Supporting Documents" accept=".pdf,.jpg,.jpeg,.png" multiple
        help={`PDF/JPG/PNG. Up to ${o.limits.documents} files in total.`} error={err("supporting_documents") ?? err("supporting_documents.0")}
        onChange={(f) => setNewDocs(f)} />
      {docs.length > 0 && (
        <ul className="ap-docs">
          {docs.map((d, i) => {
            const kept = keepDocs.includes(d.path);
            return (
              <li key={d.path} className={kept ? "" : "removed"}>
                <i className="bi bi-file-earmark-text" aria-hidden="true" />
                {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">Document {i + 1}</a> : `Document ${i + 1}`}
                <button type="button" className="btn btn-sm btn-link" onClick={() => setKeepDocs((cur) => (kept ? cur.filter((p) => p !== d.path) : [...cur, d.path]))}>
                  {kept ? "Remove" : "Undo"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="container-fluid ap-page" ref={topRef}>
      <PageHeader title="My Profile" />

      <div className="ap-summary">
        <div className="ap-summary-icon"><i className={`bi ${type === "individual" ? "bi-person-badge" : type === "group" ? "bi-people" : "bi-building"}`} aria-hidden="true" /></div>
        <div className="flex-grow-1">
          <div className="ap-summary-type">{data.type_label}</div>
          <div className="ap-summary-meta">
            {data.regno && <span><i className="bi bi-hash" /> {data.regno}</span>}
            <span><i className="bi bi-envelope" /> {data.email}</span>
          </div>
        </div>
        {status && <span className={`badge ${status[1]} ap-status`}>{status[0]}</span>}
      </div>
      {locked && data.pending ? (
        <div className="alert alert-info d-flex flex-wrap align-items-center gap-2">
          <i className="bi bi-hourglass-split" aria-hidden="true" />
          <span className="flex-grow-1">
            Update request #{data.pending.number} is waiting for review by the ZCC Nodal Officer / Admin. The form below shows your submitted changes and can be edited again after the decision.
          </span>
          <Link href="/artist/application/preview" className="border-btn rounded-2 py-1 px-3">View request</Link>
        </div>
      ) : !data.profile_completed ? (
        <div className="alert alert-warning"><i className="bi bi-info-circle me-2" />Complete your profile so organisers can discover you. Fields marked <span className="text-danger">*</span> are required.</div>
      ) : null}
      {data.verified_status === 3 && (
        <div className="alert alert-warning">
          <b><i className="bi bi-pencil-square me-2" aria-hidden="true" />Your Zonal Cultural Centre has requested changes to your registration.</b>
          {data.changes_requested && <div className="mt-1">Remarks: {data.changes_requested}</div>}
          <div className="small mt-1">Update the details below and save; your profile goes back to your Zonal Cultural Centre for review.</div>
        </div>
      )}
      {data.verified_status === 0 && data.profile_completed && !locked && (
        <div className="alert alert-light border">
          <i className="bi bi-hourglass-split me-2" aria-hidden="true" />
          {status?.[2]}
        </div>
      )}
      {!locked && data.initial_rejection && (
        <div className="alert alert-danger">
          <b><i className="bi bi-x-octagon me-2" aria-hidden="true" />Your registration was not approved.</b>
          <div className="mt-1">Reason: {data.initial_rejection}</div>
          <div className="small mt-1">Correct the details below and submit them for approval again.</div>
        </div>
      )}
      {!locked && data.rejected && (
        <div className="alert alert-danger">
          <b><i className="bi bi-arrow-counterclockwise me-2" aria-hidden="true" />Update request #{data.rejected.number} was rejected.</b>
          {data.rejected.remarks && <div className="mt-1">Remarks: {data.rejected.remarks}</div>}
          <div className="small mt-1">Your rejected changes are loaded below. Correct them and submit again.</div>
        </div>
      )}
      {!locked && data.draft && (
        <div className="alert alert-light border">
          <i className="bi bi-pencil-square me-2" aria-hidden="true" />
          You have an unsent draft (request #{data.draft.number}). It is not visible to the reviewers until you submit it.
        </div>
      )}
      {!locked && requestMode && !data.draft && !data.rejected && !data.initial_rejection && (
        <div className="alert alert-light border">
          <i className="bi bi-info-circle me-2" aria-hidden="true" />
          {status?.[2]} Changes to your profile are reviewed by the ZCC Nodal Officer / Admin before they go live.
        </div>
      )}

      {serverErrors.length > 0 && (
        <div className="alert alert-danger" role="alert">
          Please correct the highlighted fields{serverErrors.length <= 5 ? ":" : "."}
          {serverErrors.length <= 5 && <ul className="mb-0 mt-1">{serverErrors.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        </div>
      )}

      <form className="form-box ap-form" noValidate onSubmit={submit}>
        <fieldset disabled={locked} className="ap-fieldset">
        {type === "individual" && (
          <>
            <Section icon="bi-person-vcard" title="Artist Identity">
              <Col>
                <TextInput name="full_name" label="Artist's Full Name" icon="bi-person" required value={text("full_name")} onChange={set("full_name")} maxLength={150} error={err("full_name")} />
              </Col>
              <Col>
                <TextInput name="stage_name" label="Artist / Stage Name" icon="bi-stars" value={text("stage_name")} onChange={set("stage_name")} maxLength={150}
                  error={err("stage_name")} help="If you are known professionally by another name." />
              </Col>
              <Col size="col-lg-2 col-md-6">
                <TextInput name="dob" label="Date of Birth" type="date" icon="bi-calendar-event" value={text("dob")} onChange={set("dob")}
                  max={new Date().toISOString().slice(0, 10)} error={err("dob")} help="Optional." />
              </Col>
              <Col size="col-lg-2 col-md-6">
                <SelectInput name="gender" label="Gender" icon="bi-gender-ambiguous" value={text("gender")} onChange={set("gender")} options={o.genders ?? []} placeholder="Select" error={err("gender")} />
              </Col>
            </Section>

            <Section icon="bi-palette" title="Artistic Profile">
              <Col>
                <SelectInput name="art_form_id" label="Primary Art Category" icon="bi-grid" required value={text("art_form_id")}
                  onChange={(val) => setV((cur) => ({ ...cur, art_form_id: val, subgenre_id: "", other_subgenre: "" }))} options={artFormOptions} placeholder="Select category" error={err("art_form_id")} />
              </Col>
              <Col>
                <SelectInput name="subgenre_id" label="Specific Art Form" icon="bi-music-note-beamed" required value={text("subgenre_id")} onChange={set("subgenre_id")}
                  options={[...toOptions(subArtForms), ...(text("art_form_id") ? [{ value: "other", label: "Other (please specify)" }] : [])]}
                  placeholder={text("art_form_id") ? "Select art form" : "Select category first"} disabled={!text("art_form_id")} error={err("subgenre_id")} />
              </Col>
              {text("subgenre_id") === "other" && (
                <Col>
                  <TextInput name="other_subgenre" label="Name of Art Form" icon="bi-pencil" required value={text("other_subgenre")} onChange={set("other_subgenre")} maxLength={150} error={err("other_subgenre")} />
                </Col>
              )}
              <Col>
                <TextInput name="art_tradition" label="Art Form Details / Tradition" icon="bi-flower1" value={text("art_tradition")} onChange={set("art_tradition")} maxLength={255}
                  error={err("art_tradition")} help="e.g. regional style, gharana, folk tradition or speciality." />
              </Col>
              <Col size="col-lg-2 col-md-6">
                <TextInput name="years_of_practice" label="Years of Practice" icon="bi-hourglass-split" inputMode="numeric" value={text("years_of_practice")}
                  onChange={(val) => set("years_of_practice")(val.replace(/\D/g, "").slice(0, 3))} error={err("years_of_practice")} />
              </Col>
              <div className="col-12">
                <CheckChips name="language_ids" label="Languages Used in Performance" options={languageOptions} value={list("language_ids")} onChange={set("language_ids")} error={err("language_ids")} />
              </div>
              <div className="col-12">
                <TextArea name="biography" label="Artist Introduction" required rows={4} maxLength={500} value={text("biography")} onChange={set("biography")}
                  error={err("biography")} help="A short public introduction for organisers browsing artist profiles." />
                <Counter value={text("biography")} max={500} />
              </div>
            </Section>

            <Section icon="bi-geo-alt" title="Location & Contact">
              {contactFields}
              <div className="w-100" />
              {locationFields}
            </Section>

            <Section icon="bi-images" title="Artist Materials">
              <Col size="col-lg-6">
                <PhotoField name="profile_photo" label="Profile Photograph" help="JPG/JPEG/PNG, max 2 MB." round current={fileUrl("profile_photo")}
                  file={files.profile_photo ?? null} onChange={(f) => setFiles((c) => ({ ...c, profile_photo: f }))} error={err("profile_photo")} />
              </Col>
              <Col size="col-lg-6">
                <TextInput name="institutional_affiliation" label="Institution / Cultural Group Affiliation" icon="bi-bank" value={text("institutional_affiliation")}
                  onChange={set("institutional_affiliation")} maxLength={255} error={err("institutional_affiliation")} placeholder="e.g. Independent Artist" />
              </Col>
            </Section>
            {linksSection}
            {awardsSection}
          </>
        )}

        {type === "group" && (
          <>
            <Section icon="bi-people" title="Group Information">
              <Col>
                <TextInput name="group_name" label="Group Name" icon="bi-people" required value={text("group_name")} onChange={set("group_name")} maxLength={150} error={err("group_name")} />
              </Col>
              <Col>
                <SelectInput name="group_type_id" label="Group Type" icon="bi-diagram-3" required value={text("group_type_id")} onChange={set("group_type_id")}
                  options={toOptions(o.group_types)} placeholder="Select group type" error={err("group_type_id")} />
              </Col>
              {groupTypeName === "Other" && (
                <Col>
                  <TextInput name="other_group_type" label="Describe Group Type" icon="bi-pencil" required value={text("other_group_type")} onChange={set("other_group_type")} maxLength={150} error={err("other_group_type")} />
                </Col>
              )}
              <Col size="col-lg-2 col-md-6">
                <TextInput name="establishment_year" label="Year of Establishment" icon="bi-calendar" inputMode="numeric" placeholder="YYYY" value={text("establishment_year")}
                  onChange={(val) => set("establishment_year")(val.replace(/\D/g, "").slice(0, 4))} error={err("establishment_year")} />
              </Col>
              <Col size="col-lg-2 col-md-6">
                <TextInput name="total_members" label="Total Members" icon="bi-person-plus" required inputMode="numeric" value={text("total_members")}
                  onChange={(val) => set("total_members")(val.replace(/\D/g, "").slice(0, 5))} error={err("total_members")} />
              </Col>
              <Col>
                <TextInput name="registration_number" label="Group Registration Number" icon="bi-hash" required={regRequired} value={text("registration_number")}
                  onChange={set("registration_number")} maxLength={100} error={err("registration_number")}
                  help={regRequired ? "Required for a registered group." : "Only if the group is formally registered."} />
              </Col>
              <Col>
                <SelectInput name="primary_art_form_id" label="Primary Art Form" icon="bi-palette" required value={text("primary_art_form_id")}
                  onChange={(val) => setV((cur) => ({ ...cur, primary_art_form_id: val, other_art_form_ids: asList(cur.other_art_form_ids).filter((x) => x !== val) }))}
                  options={artFormOptions} placeholder="Select art form" error={err("primary_art_form_id")} />
              </Col>
              <div className="col-12">
                <CheckChips name="other_art_form_ids" label="Other Art Forms" options={artFormOptions.filter((a) => String(a.value) !== text("primary_art_form_id"))}
                  value={list("other_art_form_ids")} onChange={set("other_art_form_ids")} error={err("other_art_form_ids")} />
              </div>
              <div className="col-12">
                <CheckChips name="language_ids" label="Languages Used in Performances" options={languageOptions} value={list("language_ids")} onChange={set("language_ids")} error={err("language_ids")} />
              </div>
              <div className="col-12">
                <TextArea name="group_description" label="Group Description" required rows={5} value={text("group_description")} onChange={set("group_description")}
                  error={err("group_description")} help="The group's style, cultural practice and performance focus." />
                <Counter value={text("group_description")} max={500} unit="words" />
              </div>
            </Section>

            <Section icon="bi-person-badge" title="Representative Details" hint="The person authorised to manage this group account.">
              <Col>
                <TextInput name="full_name" label="Full Name" icon="bi-person" required value={text("full_name")} onChange={set("full_name")} maxLength={150} error={err("full_name")} />
              </Col>
              <Col>
                <datalist id="rep-roles">{(o.representative_roles ?? []).map((r) => <option key={r} value={r} />)}</datalist>
                <TextInput name="designation" label="Designation / Role in Group" icon="bi-briefcase" required list="rep-roles" value={text("designation")} onChange={set("designation")}
                  maxLength={100} error={err("designation")} help="e.g. Founder, Group Leader, Manager." />
              </Col>
              <div className="w-100" />
              {contactFields}
              <div className="col-12">
                <TextArea name="address" label="Address" required rows={2} maxLength={500} value={text("address")} onChange={set("address")} error={err("address")} />
              </div>
              {locationFields}
              <Col size="col-lg-6">
                <FileInput name="identity_document" label="Identity / Authorisation Document" accept=".pdf,.jpg,.jpeg,.png" help="PDF/JPG/PNG, max 2 MB."
                  currentUrl={fileUrl("identity_document")} error={err("identity_document")} onChange={(f) => setFiles((c) => ({ ...c, identity_document: f[0] ?? null }))} />
              </Col>
            </Section>

            <Section icon="bi-images" title="Portfolio">
              <Col size="col-lg-6">
                <PhotoField name="profile_photo" label="Group Photograph" help="JPG/JPEG/PNG, max 2 MB." current={fileUrl("profile_photo")}
                  file={files.profile_photo ?? null} onChange={(f) => setFiles((c) => ({ ...c, profile_photo: f }))} error={err("profile_photo")} />
              </Col>
              {documentsField}
            </Section>
            {linksSection}
            {awardsSection}
          </>
        )}

        {type === "organisation" && (
          <>
            <Section icon="bi-building" title="Organisation Identity">
              <Col size="col-lg-6">
                <TextInput name="institution_name" label="Organisation / Institution Name" icon="bi-building" required value={text("institution_name")}
                  onChange={set("institution_name")} maxLength={200} error={err("institution_name")} />
              </Col>
              <Col size="col-lg-3 col-md-6">
                <SelectInput name="category" label="Organisation Category" icon="bi-diagram-3" required value={category}
                  onChange={(val) => setV((cur) => ({ ...cur, category: val, sub_category: "" }))} options={strings(Object.keys(o.categories ?? {}))} placeholder="Select category" error={err("category")} />
              </Col>
              <Col size="col-lg-3 col-md-6">
                <SelectInput name="sub_category" label="Organisation Sub-category" icon="bi-diagram-2" value={text("sub_category")} onChange={set("sub_category")}
                  options={strings(o.categories?.[category])} placeholder={category ? "Select sub-category" : "Select category first"}
                  disabled={!(o.categories?.[category] ?? []).length} error={err("sub_category")} />
              </Col>
              <Col size="col-lg-2 col-md-6">
                <TextInput name="establishment_year" label="Year of Establishment" icon="bi-calendar" inputMode="numeric" placeholder="YYYY" value={text("establishment_year")}
                  onChange={(val) => set("establishment_year")(val.replace(/\D/g, "").slice(0, 4))} error={err("establishment_year")} />
              </Col>
              <Col>
                <TextInput name="registration_number" label="Registration / Establishment Ref. No." icon="bi-hash" required={regRequired} value={text("registration_number")}
                  onChange={set("registration_number")} maxLength={100} error={err("registration_number")} help={regRequired ? "Required for this category." : "Only if your organisation has one."} />
              </Col>
              <Col size="col-lg-6">
                <TextInput name="website" label="Official Website" icon="bi-globe" type="url" placeholder="https://" value={text("website")} onChange={set("website")} maxLength={255} error={err("website")} />
              </Col>
              <div className="col-12">
                <TextArea name="institution_description" label="About the Organisation" required rows={5} value={text("institution_description")}
                  onChange={set("institution_description")} error={err("institution_description")} help="Briefly describe the institution and its activities." />
                <Counter value={text("institution_description")} max={500} unit="words" />
              </div>
            </Section>

            <Section icon="bi-person-badge" title="Authorised Representative">
              <Col>
                <TextInput name="full_name" label="Authorised Contact Person Name" icon="bi-person" required value={text("full_name")} onChange={set("full_name")} maxLength={150} error={err("full_name")} />
              </Col>
              <Col>
                <datalist id="org-designations">{(o.designations ?? []).map((r) => <option key={r} value={r} />)}</datalist>
                <TextInput name="designation" label="Designation / Official Role" icon="bi-briefcase" required list="org-designations" value={text("designation")}
                  onChange={set("designation")} maxLength={100} error={err("designation")} help="e.g. Principal, Cultural Coordinator, Nodal Officer." />
              </Col>
              <div className="w-100" />
              {contactFields}
            </Section>

            <Section icon="bi-geo-alt" title="Organisation Location">
              <div className="col-12">
                <TextArea name="address" label="Office Address" required rows={2} maxLength={500} value={text("address")} onChange={set("address")} error={err("address")} />
              </div>
              {locationFields}
            </Section>

            <Section icon="bi-mic" title="Performance Hosting Profile">
              <div className="col-12">
                <span className="form-label fw-bold mb-2 d-block">Do You Host / Organise Cultural Programmes? <sup className="text-danger">*</sup></span>
                <div className="ap-radios" role="radiogroup" aria-label="Do you host or organise cultural programmes?">
                  {(o.hosts_programmes ?? []).map((h) => (
                    <label key={String(h.value)} className={`ap-chip${text("hosts_programmes") === h.value ? " on" : ""}`}>
                      <input type="radio" name="hosts_programmes" value={String(h.value)} checked={text("hosts_programmes") === h.value} onChange={() => set("hosts_programmes")(String(h.value))} />
                      {h.label}
                    </label>
                  ))}
                </div>
                {err("hosts_programmes") && <small className="text-danger d-block">{err("hosts_programmes")}</small>}
              </div>
              {text("hosts_programmes") && text("hosts_programmes") !== "no" && (
                <div className="col-12">
                  <CheckChips name="programme_types" label="Types of Programmes Hosted" required options={strings(o.programme_types)} value={list("programme_types")}
                    onChange={set("programme_types")} error={err("programme_types")} />
                </div>
              )}
              <div className="col-12">
                <CheckChips name="art_form_ids" label="Preferred Art Forms" options={artFormOptions} value={list("art_form_ids")} onChange={set("art_form_ids")} error={err("art_form_ids")} />
              </div>
              <div className="col-12">
                <CheckChips name="language_ids" label="Languages Preferred" options={languageOptions} value={list("language_ids")} onChange={set("language_ids")} error={err("language_ids")} />
              </div>
              <Col>
                <SelectInput name="audience_size" label="Typical Audience Size" icon="bi-people" value={text("audience_size")} onChange={set("audience_size")}
                  options={strings(o.audience_sizes)} placeholder="Select" error={err("audience_size")} />
              </Col>
            </Section>

            <Section icon="bi-house-door" title="Venue Details" hint="Optional. Detailed technical needs can be shared per event.">
              <Col>
                <SelectInput name="venue_availability" label="Venue Availability" icon="bi-door-open" value={text("venue_availability")} onChange={set("venue_availability")}
                  options={strings(o.venue_availability)} placeholder="Select" error={err("venue_availability")} />
              </Col>
              <Col size="col-lg-8">
                <TextInput name="venue_locations" label="Venue City / State" icon="bi-pin-map" value={text("venue_locations")} onChange={set("venue_locations")} maxLength={500}
                  error={err("venue_locations")} help="List each venue location if you operate at more than one site." />
              </Col>
              <div className="col-12">
                <CheckChips name="venue_types" label="Venue Type" options={strings(o.venue_types)} value={list("venue_types")} onChange={set("venue_types")} error={err("venue_types")} />
              </div>
              <div className="col-12">
                <CheckChips name="venue_facilities" label="Venue Facilities Available" options={strings(o.venue_facilities)} value={list("venue_facilities")}
                  onChange={set("venue_facilities")} error={err("venue_facilities")} />
              </div>
            </Section>

            <Section icon="bi-folder2-open" title="Institutional Portfolio">
              <Col size="col-lg-6">
                <PhotoField name="institution_logo" label="Organisation Logo" help="JPG/JPEG/PNG, max 5 MB." current={fileUrl("institution_logo")}
                  file={files.institution_logo ?? null} onChange={(f) => setFiles((c) => ({ ...c, institution_logo: f }))} error={err("institution_logo")} />
              </Col>
              <Col size="col-lg-6">
                <FileInput name="brochure" label="Brochure / Organisation Profile" accept=".pdf" help="PDF, max 5 MB." currentUrl={fileUrl("brochure")}
                  currentLabel="View current brochure" error={err("brochure")} onChange={(f) => setFiles((c) => ({ ...c, brochure: f[0] ?? null }))} />
              </Col>
              <div className="col-12">
                <TextArea name="major_events" label="Major Events / Programmes Organised" rows={4} value={text("major_events")} onChange={set("major_events")} error={err("major_events")} />
                <Counter value={text("major_events")} max={500} unit="words" />
              </div>
              <div className="col-12">
                <TextArea name="collaborations" label="Past Artist / Cultural Collaborations" rows={3} maxLength={2000} value={text("collaborations")}
                  onChange={set("collaborations")} error={err("collaborations")} />
              </div>
              {documentsField}
            </Section>
            {linksSection}
            {awardsSection}
          </>
        )}

        <Section icon="bi-shield-check" title="Declaration & Consent">
          <div className="col-12">
            {type === "organisation" && (
              <Check name="authorisation" required checked={!!v.authorisation} onChange={set("authorisation")} error={err("authorisation")}>
                I confirm that I am authorised to manage this organisation account.
              </Check>
            )}
            <Check name="declaration" required checked={!!v.declaration} onChange={set("declaration")} error={err("declaration")}>
              {type === "group"
                ? "I confirm that the group information submitted is accurate and that I am authorised to submit it."
                : type === "individual"
                  ? "I confirm that the information submitted is accurate and consent to its use for registration and assessment."
                  : "I confirm that the information submitted is accurate."}
            </Check>
            {type !== "individual" && (
              <Check name="privacy" required checked={!!v.privacy} onChange={set("privacy")} error={err("privacy")}>
                I agree to the processing of this data as described in the{" "}
                <a href="/content/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
              </Check>
            )}
            <Check name="public_profile" checked={!!v.public_profile} onChange={set("public_profile")}>
              {type === "individual" ? "Show my approved profile details in the public artist directory." : type === "group"
                ? "Show the approved group details, photo and portfolio in the public directory."
                : "Show the approved organisation details and logo in the public directory."}{" "}
              <span className="text-muted">(optional)</span>
            </Check>
          </div>
        </Section>

        </fieldset>

        {locked ? (
          <div className="ap-actions">
            <Link href="/artist/application" className="cms-btn rounded-2">
              <i className="bi bi-clipboard-check me-2" aria-hidden="true" />My Application
            </Link>
          </div>
        ) : (
          <div className="ap-actions">
            <button type="button" className="border-btn rounded-2" disabled={busy} onClick={onReset}>
              Reset
            </button>
            {requestMode ? (
              <>
                <button type="submit" name="action" value="draft" className="border-btn rounded-2" disabled={busy}>
                  <i className="bi bi-save me-2" aria-hidden="true" />Save Draft
                </button>
                <button type="submit" name="action" value="submit" className="cms-btn rounded-2" disabled={busy}>
                  {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : <i className="bi bi-send me-2" aria-hidden="true" />}
                  Submit for Approval
                </button>
              </>
            ) : (
              <button type="submit" name="action" value="save" className="cms-btn rounded-2" disabled={busy}>
                {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
                Save Profile
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
