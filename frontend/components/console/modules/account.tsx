"use client";

// Signed-in user's own pages (Topbar dropdown): Update Profile
// (backend/views/backend/users/profile.blade.php) and Change Password
// (users/changePassword.blade.php). Available to every role.
import { useState } from "react";
import { http } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/context/AuthContext";
import { useApiData } from "../crud/useApi";
import { GENDER_OPTIONS } from "../crud/common";
import PageHeader, { Loader, SuccessBox } from "../ui/PageHeader";
import { ErrorList, SelectInput, TextArea, TextInput, toOptions } from "../ui/fields";

type ZccProfile = {
  linked: boolean;
  code?: string;
  name?: string;
  headquarters?: string;
  contact_person?: string | null;
  contact_designation?: string | null;
  contact_mobile?: string | null;
  contact_mobile_alt?: string | null;
  contact_email?: string | null;
  states?: { name: string; short: string | null }[];
};

type ProfileData = {
  user: Record<string, string | number | boolean | null>;
  countries: { id: number; name: string }[];
  regions: { id: number; name: string }[];
  /** Zonal Cultural Centre officials only (role 8). */
  zcc?: ZccProfile | null;
};

/** ZCC officials: their centre and every member State / UT (no State / UT to choose). */
function ZccCard({ zcc }: { zcc: ZccProfile }) {
  if (!zcc.linked) {
    return (
      <div className="alert alert-warning">
        <i className="bi bi-exclamation-triangle me-2" aria-hidden="true" />
        Your account is not linked to a Zonal Cultural Centre. Please contact the administrator.
      </div>
    );
  }
  const states = zcc.states ?? [];
  const phones = [zcc.contact_mobile, zcc.contact_mobile_alt].filter(Boolean).join(" / ");
  return (
    <div className="form-box mb-3">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
        <div>
          <div className="text-muted small text-uppercase fw-semibold">Zonal Cultural Centre</div>
          <h2 className="h5 fw-bold mb-1">
            <i className="bi bi-bank me-2" aria-hidden="true" />
            {zcc.name} ({zcc.code})
          </h2>
          <div className="small">
            <i className="bi bi-geo-alt me-1" aria-hidden="true" />Headquarters: <b>{zcc.headquarters}</b>
          </div>
        </div>
        <div className="small text-lg-end">
          {zcc.contact_person && (
            <div><i className="bi bi-person-badge me-1" aria-hidden="true" />{zcc.contact_person}{zcc.contact_designation ? `, ${zcc.contact_designation}` : ""}</div>
          )}
          {phones && <div><i className="bi bi-telephone me-1" aria-hidden="true" />{phones}</div>}
          {zcc.contact_email && <div><i className="bi bi-envelope me-1" aria-hidden="true" />{zcc.contact_email}</div>}
        </div>
      </div>
      <hr className="my-3" />
      <div className="fw-semibold mb-2">
        Member States / UTs <span className="badge bg-secondary ms-1">{states.length}</span>
      </div>
      <div className="d-flex flex-wrap gap-2">
        {states.map((s) => (
          <span key={s.name} className="badge rounded-pill bg-light text-dark border px-3 py-2 fw-normal">
            <i className="bi bi-geo-alt-fill me-1 text-danger" aria-hidden="true" />
            {s.name}
          </span>
        ))}
      </div>
      <div className="small text-muted mt-2">You review and manage the artists registered in these States / UTs.</div>
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(fn: () => Promise<{ message: string }>) {
    setBusy(true);
    setErrors({});
    setMessage(null);
    setDone(null);
    try {
      const res = await fn();
      setDone(res.message);
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.errors);
        setMessage(e.message);
      } else setMessage("Something went wrong. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, errors, message, done, setDone, run };
}

const PROFILE_FIELDS = ["firstname", "lastname", "gender", "email", "mobile", "designation", "region_id", "city", "pincode", "address"] as const;

export function ProfilePage() {
  const { data, loading } = useApiData<ProfileData>("/console/profile");
  const { verify } = useAuth();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const s = useSubmit();

  if (loading && !data) return <Loader />;
  if (!data) return null;

  const loaded = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, data.user[k] == null ? "" : String(data.user[k])]));
  const v = values ?? loaded;
  const set = (k: string) => (val: string) => setValues({ ...v, [k]: val });
  const err = (k: string) => s.errors[k]?.[0];
  const emailLocked = Boolean(data.user.email_verified);
  const mobileLocked = Boolean(data.user.mobile_verified);

  return (
    <div className="container-fluid">
      <PageHeader title="Update Profile" />
      <SuccessBox message={s.done} onClose={() => s.setDone(null)} />
      <ErrorList errors={s.errors} message={s.message} />
      {data.zcc && <ZccCard zcc={data.zcc} />}

      <form
        className="form-box"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await s.run(() => http.put("/console/profile", { ...v, region_id: v.region_id || null }));
          if (ok) verify(); // refresh the name shown in the top bar
        }}
      >
        <div className="row">
          <div className="col-lg-3 mb-3">
            <TextInput name="regno" label="Registration No." icon="bi-hash" value={String(data.user.regno ?? "—")} onChange={() => undefined} disabled className="bg-input-disabled" />
          </div>
          <div className="col-lg-3 mb-3">
            <TextInput name="role" label="Role" icon="bi-person-gear" value={String(data.user.role ?? "—")} onChange={() => undefined} disabled className="bg-input-disabled" />
          </div>
          <div className="col-lg-3 mb-3">
            {data.zcc ? (
              // ZCC: the zone is the centre's member States / UTs (shown above), nothing to choose.
              <TextInput name="zcc" label="Zonal Cultural Centre" icon="bi-bank" value={data.zcc.linked ? `${data.zcc.code} – ${data.zcc.headquarters}` : "Not linked"} onChange={() => undefined} disabled className="bg-input-disabled" />
            ) : (
              <SelectInput name="region_id" label="State / UT" icon="bi-geo-alt" value={v.region_id} onChange={set("region_id")} options={toOptions(data.regions)} placeholder="Select State / UT" error={err("region_id")} />
            )}
          </div>
          <div className="col-lg-3 mb-3">
            <TextInput name="firstname" label="First Name" icon="bi-person" required value={v.firstname} onChange={set("firstname")} maxLength={100} error={err("firstname")} />
          </div>
          <div className="col-lg-3 mb-3">
            <TextInput name="lastname" label="Last Name" icon="bi-person" required value={v.lastname} onChange={set("lastname")} maxLength={100} error={err("lastname")} />
          </div>
          <div className="col-lg-3 mb-3">
            <SelectInput name="gender" label="Gender" icon="bi-gender-ambiguous" required value={v.gender} onChange={set("gender")} options={GENDER_OPTIONS} placeholder="Select Gender" error={err("gender")} />
          </div>
          <div className="col-lg-3 mb-3">
            {/* Verified email / mobile are read-only (the API rejects a change as well). */}
            {emailLocked ? (
              <TextInput name="email" label="Email" type="email" icon="bi-envelope-check" required value={v.email} onChange={() => undefined} disabled className="bg-input-disabled" error={err("email")} help="Verified — cannot be changed." />
            ) : (
              <TextInput name="email" label="Email" type="email" icon="bi-envelope" required value={v.email} onChange={set("email")} error={err("email")} />
            )}
          </div>
          <div className="col-lg-3 mb-3">
            {mobileLocked ? (
              <TextInput name="mobile" label="Mobile Number" icon="bi-telephone" required value={v.mobile} onChange={() => undefined} disabled className="bg-input-disabled" error={err("mobile")} help="Verified — cannot be changed." />
            ) : (
              <TextInput name="mobile" label="Mobile Number" icon="bi-telephone" required value={v.mobile} onChange={set("mobile")} maxLength={10} error={err("mobile")} />
            )}
          </div>
          <div className="col-lg-3 mb-3">
            <TextInput name="designation" label="Designation" icon="bi-briefcase" value={v.designation} onChange={set("designation")} maxLength={255} error={err("designation")} />
          </div>
          <div className="col-lg-3 mb-3">
            <TextInput name="city" label="City / Town" icon="bi-buildings" required value={v.city} onChange={set("city")} maxLength={255} error={err("city")} />
          </div>
          <div className="col-lg-3 mb-3">
            <TextInput name="pincode" label="Pincode" icon="bi-mailbox" value={v.pincode} onChange={set("pincode")} maxLength={55} error={err("pincode")} />
          </div>
          <div className="col-lg-12 mb-3">
            <TextArea name="address" label="Address" value={v.address} onChange={set("address")} rows={2} maxLength={255} error={err("address")} />
          </div>
          <div className="col-lg-12 my-4">
            <div className="d-flex justify-content-end align-items-center gap-3">
              <button type="submit" className="cms-btn rounded-2" disabled={s.busy}>
                {s.busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
                Update
              </button>
              <button type="button" className="border-btn rounded-2" onClick={() => setValues(null)} disabled={s.busy}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export function ChangePasswordPage() {
  const [v, setV] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [show, setShow] = useState(false);
  const s = useSubmit();
  const err = (k: string) => s.errors[k]?.[0];
  const type = show ? "text" : "password";

  return (
    <div className="container-fluid">
      <PageHeader title="Change Password" />
      <SuccessBox message={s.done} onClose={() => s.setDone(null)} />
      <ErrorList errors={s.errors} message={s.message} />

      <form
        className="form-box"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await s.run(() => http.put("/console/password", v));
          if (ok) setV({ current_password: "", password: "", password_confirmation: "" });
        }}
      >
        <div className="row justify-content-center">
          <div className="col-lg-6">
            <div className="mb-3">
              <TextInput name="current_password" label="Current Password" type={type} icon="bi-lock" required autoComplete="current-password" value={v.current_password} onChange={(x) => setV({ ...v, current_password: x })} error={err("current_password")} />
            </div>
            <div className="mb-3">
              <TextInput name="password" label="New Password" type={type} icon="bi-key" required autoComplete="new-password" minLength={12} maxLength={72} value={v.password} onChange={(x) => setV({ ...v, password: x })} error={err("password")} help="12 to 72 characters, different from your current password." />
            </div>
            <div className="mb-3">
              <TextInput
                name="password_confirmation"
                label="Confirm New Password"
                type={type}
                icon="bi-key-fill"
                required
                autoComplete="new-password"
                value={v.password_confirmation}
                onChange={(x) => setV({ ...v, password_confirmation: x })}
                error={v.password_confirmation && v.password !== v.password_confirmation ? "Passwords do not match." : undefined}
              />
            </div>
            <div className="form-check mb-3">
              <input className="form-check-input" type="checkbox" id="show_password" checked={show} onChange={(e) => setShow(e.target.checked)} />
              <label className="form-check-label" htmlFor="show_password">Show passwords</label>
            </div>
            <div className="d-flex justify-content-end gap-3 my-4">
              <button type="submit" className="cms-btn rounded-2" disabled={s.busy || !v.password || v.password !== v.password_confirmation}>
                {s.busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
                Update Password
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
