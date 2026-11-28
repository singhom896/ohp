"use client";

// Basic self-registration, two separate paths (see RegisterChooser):
//   path "artist":  Individual Artist / Artist Group / Organisation / Institute
//                   (fields per "Opportunity Hub_Forms.xlsx")
//   path "partner": Engagement Partner (hotels, wedding / event / festival
//                   organisers, corporates, cultural institutions, government departments)
// Laravel re-checks every rule in Api\V1\AuthController::register. No payment.
// Email OTP and Mobile OTP are each shown only when switched on (backend .env
// OTP_EMAIL_ENABLED / OTP_MOBILE_ENABLED, read via GET /api/registration/options);
// when off, the plain field is shown and the form goes ahead without the OTP.
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api/client";
import CaptchaField, { useCaptcha } from "@/components/auth/Captcha";
import OtpField from "@/components/auth/OtpField";

type AccountType = "artist" | "group" | "organisation" | "partner";
export type RegisterPath = "artist" | "partner";

type Values = {
  group_name: string;
  organisation_name: string;
  organisation_type: string;
  partner_type: string;
  address: string;
  first_name: string;
  last_name: string;
  designation: string;
  mobile: string;
  email: string;
  password: string;
  password_confirmation: string;
  // Location (same fields as My Profile / Organisation Profile): maps the account to its ZCC.
  state_id: string;
  district_id: string;
  city: string;
  pincode: string;
  // One checkbox accepts the Terms & Conditions and acknowledges the Privacy Policy.
  terms: boolean;
  captcha: string;
};
type Field = keyof Values | "email_otp" | "mobile_otp";

/** Which OTPs are on, and the verified tokens. */
type Otp = { emailOn: boolean; mobileOn: boolean; emailToken: string; mobileToken: string };
type Errors = Partial<Record<Field, string>>;

type IdName = { id: number; name: string };
type Options = {
  organisation_types: string[];
  partner_types: string[];
  states: IdName[];
  districts: (IdName & { state_id: number })[];
  email_otp_enabled: boolean;
  mobile_otp_enabled: boolean;
};

const EMPTY: Values = {
  group_name: "", organisation_name: "", organisation_type: "", partner_type: "", address: "", first_name: "", last_name: "", designation: "",
  mobile: "", email: "", password: "", password_confirmation: "", state_id: "", district_id: "", city: "", pincode: "", terms: false, captcha: "",
};

const PLACE = /^[\p{L}\p{M}\p{N}\s.,'()/-]+$/u;

/** Artist / Group path: three sub-categories. */
const accountTypes: { id: AccountType; icon: string; title: string; desc: string }[] = [
  { id: "artist", icon: "🎭", title: "Individual Artist", desc: "Create an individual artist account" },
  { id: "group", icon: "👥", title: "Artist Group (Leader Details)", desc: "Create a group account and complete group details after login" },
  { id: "organisation", icon: "🏛️", title: "Organisation / Institute", desc: "Arts organisation, academy or institute: complete details after login" },
];

/** Labels change with the account type, as in the spec sheets. */
const LABELS: Record<AccountType, { first: string; last: string; password: string }> = {
  artist: { first: "First Name", last: "Last Name", password: "Password" },
  group: { first: "Leader First Name", last: "Leader Last Name", password: "Create Password" },
  organisation: { first: "Authorised Contact Person First Name", last: "Authorised Contact Person Last Name", password: "Create Password" },
  partner: { first: "Contact Person First Name", last: "Contact Person Last Name", password: "Create Password" },
};

/** Laravel field -> form field (for server-side errors). */
const SERVER_FIELDS: Record<string, Field> = {
  email_otp_token: "email_otp",
  email_otp: "email_otp",
  mobile_otp_token: "mobile_otp",
  mobile_otp: "mobile_otp",
  captcha_key: "captcha",
  account_type: "first_name",
  privacy: "terms",
};

const PERSON = /^[\p{L}\p{M}\s.'-]+$/u;
const ORG = /^[\p{L}\p{M}\p{N}\s&.,'()/-]+$/u;
const squash = (s: string) => s.trim().replace(/\s+/g, " ");

function validate(type: AccountType, v: Values, otp: Otp): Errors {
  const e: Errors = {};
  const L = LABELS[type];
  const person = (field: "first_name" | "last_name", label: string) => {
    const s = squash(v[field]);
    if (!s) e[field] = `Please enter the ${label.toLowerCase()}.`;
    else if (s.length > 100) e[field] = `${label} may not be greater than 100 characters.`;
    else if (!PERSON.test(s)) e[field] = `${label} can only contain letters, spaces, dots, hyphens and apostrophes.`;
  };

  if (type === "group") {
    const s = squash(v.group_name);
    if (!s) e.group_name = "Please enter the group name.";
    else if (s.length > 150) e.group_name = "Group name may not be greater than 150 characters.";
    else if (!ORG.test(s)) e.group_name = "Group name contains characters that are not allowed.";
  }
  if (type === "organisation" || type === "partner") {
    const s = squash(v.organisation_name);
    if (!s) e.organisation_name = type === "partner" ? "Please enter the organisation / business name." : "Please enter the organisation / institute name.";
    else if (s.length > 200) e.organisation_name = "Organisation name may not be greater than 200 characters.";
    else if (!ORG.test(s)) e.organisation_name = "Organisation name contains characters that are not allowed.";
  }
  if (type === "organisation" && !v.organisation_type) e.organisation_type = "Please select the organisation type.";
  if (type === "partner" && !v.partner_type) e.partner_type = "Please select the engagement partner type.";
  person("first_name", L.first);
  person("last_name", L.last);
  if (type === "organisation" || type === "partner") {
    const s = squash(v.designation);
    if (!s && type === "organisation") e.designation = "Please enter the designation.";
    else if (s && (s.length > 100 || !ORG.test(s))) e.designation = "Please enter a valid designation (max 100 characters).";
  }
  if (type === "partner" && squash(v.address).length > 500) e.address = "Address may not be greater than 500 characters.";

  if (!v.mobile.trim()) e.mobile = "Please enter the mobile number.";
  else if (!/^[6-9][0-9]{9}$/.test(v.mobile.trim())) e.mobile = "Please enter a valid 10-digit Indian mobile number.";
  else if (otp.mobileOn && !otp.mobileToken) e.mobile_otp = "Please verify your mobile number with the OTP.";

  const email = v.email.trim();
  if (!email) e.email = "Please enter the email address.";
  else if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = "Please enter a valid email address.";
  else if (otp.emailOn && !otp.emailToken) e.email_otp = "Please verify your email address with the OTP.";

  if (!v.state_id) e.state_id = "Please select the State / UT.";
  if (!v.district_id) e.district_id = v.state_id ? "Please select the district." : "Please select the State / UT first.";
  const city = squash(v.city);
  if (!city) e.city = type === "artist" ? "Please enter the city / town / village." : "Please enter the city / town.";
  else if (city && (city.length > 100 || !PLACE.test(city))) e.city = "Please enter a valid city / town (max 100 characters).";
  const pin = v.pincode.trim();
  if (!pin) e.pincode = "Please enter the PIN code.";
  else if (pin && !/^[1-9][0-9]{5}$/.test(pin)) e.pincode = "Please enter a valid 6-digit PIN code.";

  if (!v.password) e.password = "Please enter a password.";
  else if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/[0-9]/.test(v.password))
    e.password = "Password must be at least 8 characters and contain both letters and numbers.";
  if (!v.password_confirmation) e.password_confirmation = "Please confirm the password.";
  else if (v.password_confirmation !== v.password) e.password_confirmation = "Password and Confirm Password must match.";

  if (!v.terms) e.terms = "Please accept the Terms & Conditions and acknowledge the Privacy Policy.";

  if (!v.captcha.trim()) e.captcha = "Please enter the CAPTCHA code.";
  return e;
}

/** Field order per account type (spec order), for focusing the first error. */
const LOCATION: Field[] = ["state_id", "district_id", "city", "pincode"];
const ORDER: Record<AccountType, Field[]> = {
  artist: ["first_name", "last_name", "mobile", "mobile_otp", "email", "email_otp", ...LOCATION, "password", "password_confirmation", "captcha", "terms"],
  group: ["group_name", "first_name", "last_name", "mobile", "mobile_otp", "email", "email_otp", ...LOCATION, "password", "password_confirmation", "captcha", "terms"],
  organisation: ["organisation_name", "organisation_type", "first_name", "last_name", "designation", "email", "email_otp", "mobile", "mobile_otp", ...LOCATION, "password", "password_confirmation", "captcha", "terms"],
  partner: ["organisation_name", "partner_type", "first_name", "last_name", "designation", "mobile", "mobile_otp", "email", "email_otp", "address", ...LOCATION, "password", "password_confirmation", "captcha", "terms"],
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <div id={`${id}-error`} className="text-danger small mt-1">
      {message}
    </div>
  );
}

export default function RegisterForm({ path = "artist", onChangePath }: { path?: RegisterPath; onChangePath?: () => void }) {
  const router = useRouter();
  const captcha = useCaptcha();
  const [accountType, setAccountType] = useState<AccountType>(path === "partner" ? "partner" : "artist");
  const [options, setOptions] = useState<Options | null>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [emailToken, setEmailToken] = useState("");
  const [mobileToken, setMobileToken] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<Options>("/registration/options")
      .then((r) => live && setOptions(r.data))
      .catch(() => live && setError("Unable to load the registration form. Please refresh the page."));
    return () => {
      live = false;
    };
  }, []);

  const otp: Otp = {
    emailOn: options?.email_otp_enabled ?? true,
    mobileOn: options?.mobile_otp_enabled ?? true,
    emailToken,
    mobileToken,
  };
  const L = LABELS[accountType];

  // After the first submit, re-validate while typing so errors clear live.
  const change = <K extends keyof Values>(field: K, value: Values[K]) => {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setFieldErrors(validate(accountType, next, otp));
  };

  const switchType = (t: AccountType) => {
    setAccountType(t);
    setFieldErrors(submitted ? validate(t, values, otp) : {});
  };

  const setToken = (channel: "email" | "mobile", token: string) => {
    if (channel === "email") setEmailToken(token);
    else setMobileToken(token);
    if (submitted) setFieldErrors(validate(accountType, values, { ...otp, [channel === "email" ? "emailToken" : "mobileToken"]: token }));
  };

  const focusFirst = (errs: Errors) => {
    const first = ORDER[accountType].find((f) => errs[f]);
    if (first) document.getElementById(first)?.focus();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);

    const errs = validate(accountType, values, otp);
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      setError("Please correct the highlighted fields.");
      focusFirst(errs);
      return;
    }

    setSubmitting(true);
    try {
      const common = {
        account_type: accountType,
        first_name: squash(values.first_name),
        last_name: squash(values.last_name),
        mobile: values.mobile.trim(),
        email: values.email.trim(),
        email_otp_token: otp.emailOn ? emailToken : undefined,
        mobile_otp_token: otp.mobileOn ? mobileToken : undefined,
        password: values.password,
        password_confirmation: values.password_confirmation,
        state_id: values.state_id,
        district_id: values.district_id,
        city: squash(values.city) || undefined,
        pincode: values.pincode.trim() || undefined,
        // One checkbox accepts the Terms & Conditions and acknowledges the Privacy Policy.
        terms: values.terms,
        privacy: values.terms,
        captcha: values.captcha.trim(),
        captcha_key: captcha.key,
      };
      const extra =
        accountType === "group"
          ? { group_name: squash(values.group_name) }
          : accountType === "organisation"
            ? { organisation_name: squash(values.organisation_name), organisation_type: values.organisation_type, designation: squash(values.designation) }
            : accountType === "partner"
              ? { organisation_name: squash(values.organisation_name), partner_type: values.partner_type, designation: squash(values.designation) || undefined, address: squash(values.address) || undefined }
              : {};
      await api.post("/auth/register", { ...common, ...extra });
      setValues(EMPTY);
      setEmailToken("");
      setMobileToken("");
      setSubmitted(false);
      setFieldErrors({});
      setShowSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const byField: Errors = {};
        for (const [field, messages] of Object.entries(err.errors)) {
          const key = field.split(".")[0];
          const f = (SERVER_FIELDS[key] ?? key) as Field;
          if (!byField[f]) byField[f] = messages[0];
        }
        // A spent / expired OTP token must be verified again.
        if (byField.email_otp) setEmailToken("");
        if (byField.mobile_otp) setMobileToken("");
        setFieldErrors(byField);
        setError(Object.keys(byField).length ? "Please correct the highlighted fields." : err.message);
        focusFirst(byField);
      } else {
        setError("Something went wrong. Please try again.");
      }
      setValues((v) => ({ ...v, captcha: "" }));
    } finally {
      // A captcha key works once: load a new image after every attempt.
      captcha.refresh();
      setSubmitting(false);
    }
  };

  const err = fieldErrors;
  const inputProps = (f: Field) => ({
    "aria-invalid": !!err[f],
    "aria-describedby": err[f] ? `${f}-error` : undefined,
  });

  const textField = (f: "group_name" | "organisation_name" | "first_name" | "last_name" | "designation" | "address", label: string, opts: { max: number; placeholder: string; autoComplete?: string; full?: boolean; optional?: boolean }) => (
    <div className={`field${opts.full ? " full-row" : ""}`} key={f}>
      <label htmlFor={f}>
        {label} {opts.optional ? <span className="opt">(optional)</span> : <span className="req">*</span>}
      </label>
      <input
        id={f}
        name={f}
        type="text"
        maxLength={opts.max}
        autoComplete={opts.autoComplete ?? "off"}
        placeholder={opts.placeholder}
        value={values[f]}
        onChange={(e) => change(f, e.target.value)}
        {...inputProps(f)}
      />
      <FieldError id={f} message={err[f]} />
    </div>
  );

  // Mobile / Email: with their OTP step when switched on, else a plain field.
  const mobileField = otp.mobileOn ? (
    <OtpField
      key="mobile"
      channel="mobile"
      value={values.mobile}
      onValueChange={(v) => {
        change("mobile", v);
        if (mobileToken) setToken("mobile", "");
      }}
      token={mobileToken}
      onToken={(t) => setToken("mobile", t)}
      valueError={err.mobile}
      otpError={err.mobile_otp}
    />
  ) : (
    <div className="field" key="mobile">
      <label htmlFor="mobile">
        Mobile Number <span className="req">*</span>
      </label>
      <input
        id="mobile"
        name="mobile"
        type="tel"
        inputMode="numeric"
        maxLength={10}
        autoComplete="tel-national"
        placeholder="10-digit mobile number"
        value={values.mobile}
        // Digits only, like the backend rule.
        onChange={(e) => change("mobile", e.target.value.replace(/\D/g, ""))}
        {...inputProps("mobile")}
      />
      <FieldError id="mobile" message={err.mobile} />
    </div>
  );

  const emailFields = otp.emailOn ? (
    <OtpField
      key="email"
      channel="email"
      value={values.email}
      onValueChange={(v) => {
        change("email", v);
        if (emailToken) setToken("email", "");
      }}
      token={emailToken}
      onToken={(t) => setToken("email", t)}
      valueError={err.email}
      otpError={err.email_otp}
    />
  ) : (
    <div className="field" key="email">
      <label htmlFor="email">
        Email Address <span className="req">*</span>
      </label>
      <input id="email" name="email" type="email" maxLength={255} autoComplete="email" placeholder="name@example.com" value={values.email} onChange={(e) => change("email", e.target.value)} {...inputProps("email")} />
      <FieldError id="email" message={err.email} />
    </div>
  );

  const passwordFields = (
    <>
      <div className="field">
        <label htmlFor="password">
          {L.password} <span className="req">*</span>
        </label>
        <input id="password" name="password" type="password" maxLength={72} autoComplete="new-password" placeholder="Min 8 characters, letters and numbers" value={values.password} onChange={(e) => change("password", e.target.value)} {...inputProps("password")} />
        <FieldError id="password" message={err.password} />
      </div>
      <div className="field">
        <label htmlFor="password_confirmation">
          Confirm Password <span className="req">*</span>
        </label>
        <input id="password_confirmation" name="password_confirmation" type="password" maxLength={72} autoComplete="new-password" placeholder="Re-enter password" value={values.password_confirmation} onChange={(e) => change("password_confirmation", e.target.value)} {...inputProps("password_confirmation")} />
        <FieldError id="password_confirmation" message={err.password_confirmation} />
      </div>
    </>
  );

  // Location: same State / UT, District, City and PIN fields as the profile pages.
  const districts = (options?.districts ?? []).filter((d) => String(d.state_id) === values.state_id);

  const locationFields = (
    <>
      <div className="field">
        <label htmlFor="state_id">
          State / Union Territory <span className="req">*</span>
        </label>
        <select
          id="state_id"
          name="state_id"
          value={values.state_id}
          onChange={(e) => {
            const next = { ...values, state_id: e.target.value, district_id: "" };
            setValues(next);
            if (submitted) setFieldErrors(validate(accountType, next, otp));
          }}
          {...inputProps("state_id")}
        >
          <option value="">Select State / UT</option>
          {(options?.states ?? []).map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>
        <FieldError id="state_id" message={err.state_id} />
      </div>
      <div className="field">
        <label htmlFor="district_id">
          District <span className="req">*</span>
        </label>
        <select id="district_id" name="district_id" value={values.district_id} disabled={!values.state_id} onChange={(e) => change("district_id", e.target.value)} {...inputProps("district_id")}>
          <option value="">{values.state_id ? "Select District" : "Select State / UT first"}</option>
          {districts.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </select>
        <FieldError id="district_id" message={err.district_id} />
      </div>
      <div className="field">
        <label htmlFor="city">
          {accountType === "artist" ? "City / Town / Village" : "City / Town"} <span className="req">*</span>
        </label>
        <input id="city" name="city" type="text" maxLength={100} autoComplete="address-level2" placeholder="Enter city / town" value={values.city} onChange={(e) => change("city", e.target.value)} {...inputProps("city")} />
        <FieldError id="city" message={err.city} />
      </div>
      <div className="field">
        <label htmlFor="pincode">
          PIN Code <span className="req">*</span>
        </label>
        <input
          id="pincode"
          name="pincode"
          type="text"
          inputMode="numeric"
          maxLength={6}
          autoComplete="postal-code"
          placeholder="6-digit PIN code"
          value={values.pincode}
          onChange={(e) => change("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
          {...inputProps("pincode")}
        />
        <FieldError id="pincode" message={err.pincode} />
      </div>
    </>
  );

  const isPartner = path === "partner";

  return (
    <>
      <div className="intro">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div className="kicker">{isPartner ? "ENGAGEMENT PARTNER REGISTRATION" : "ARTIST / GROUP / ORGANISATION REGISTRATION"}</div>
          {onChangePath && (
            <button type="button" className="reg-switch" onClick={onChangePath}>
              ← Register as {isPartner ? "Artist / Group / Organisation" : "Engagement Partner"} instead
            </button>
          )}
        </div>
        <h1>{isPartner ? "Register as an Engagement Partner" : "Create your Opportunity Hub account"}</h1>
        <div className="subtitle">
          {isPartner
            ? "For hotels, wedding / event / festival organisers, corporates, cultural institutions and government departments that want to discover artists and manage performance opportunities. Complete your organisation profile after login."
            : "Start with only your basic contact and login details. Your detailed Artist, Group or Organisation / Institute profile will be completed after login from the respective dashboard."}
        </div>
        {!isPartner && (
        <div className="type-grid" role="radiogroup" aria-label="Account type">
          {accountTypes.map((t) => (
            <div
              key={t.id}
              role="radio"
              tabIndex={0}
              aria-checked={accountType === t.id}
              className={`type-card${accountType === t.id ? " selected" : ""}`}
              onClick={() => switchType(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  switchType(t.id);
                }
              }}
            >
              <div className="type-title">
                <span className="type-icon">{t.icon}</span>
                {t.title}
              </div>
              <div className="type-desc">{t.desc}</div>
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="form-area">
        <div className="notice">
          <strong>Only basic registration is required now.</strong>{" "}
          {isPartner
            ? "Your organisation profile and supporting documents are completed after login from your dashboard."
            : "Detailed profile information, documents, experience and portfolio are completed after login from your dashboard."}{" "}
          Registration on Opportunity Hub is free; there is no fee or payment.
        </div>
        {error && (
          <div className="alert alert-danger py-2" role="alert">
            {error}
          </div>
        )}
        <form id="registrationForm" onSubmit={onSubmit} noValidate>
          <div className="form-grid">
            {accountType === "artist" && (
              <>
                {textField("first_name", L.first, { max: 100, placeholder: "Enter first name", autoComplete: "given-name" })}
                {textField("last_name", L.last, { max: 100, placeholder: "Enter last name", autoComplete: "family-name" })}
                {mobileField}
                {emailFields}
              </>
            )}

            {accountType === "group" && (
              <>
                {textField("group_name", "Group Name", { max: 150, placeholder: "Name by which the group is known", full: true })}
                {textField("first_name", L.first, { max: 100, placeholder: "Leader's first name", autoComplete: "given-name" })}
                {textField("last_name", L.last, { max: 100, placeholder: "Leader's last name", autoComplete: "family-name" })}
                {mobileField}
                {emailFields}
              </>
            )}

            {accountType === "organisation" && (
              <>
                {textField("organisation_name", "Organisation / Institute Name", { max: 200, placeholder: "Official or commonly used name", autoComplete: "organization" })}
                <div className="field">
                  <label htmlFor="organisation_type">
                    Organisation Type <span className="req">*</span>
                  </label>
                  <select
                    id="organisation_type"
                    name="organisation_type"
                    value={values.organisation_type}
                    onChange={(e) => change("organisation_type", e.target.value)}
                    {...inputProps("organisation_type")}
                  >
                    <option value="">Select organisation type</option>
                    {(options?.organisation_types ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <FieldError id="organisation_type" message={err.organisation_type} />
                </div>
                {textField("first_name", L.first, { max: 100, placeholder: "Contact person's first name", autoComplete: "given-name" })}
                {textField("last_name", L.last, { max: 100, placeholder: "Contact person's last name", autoComplete: "family-name" })}
                {textField("designation", "Designation", { max: 100, placeholder: "Official designation / role", autoComplete: "organization-title", full: true })}
                {emailFields}
                {mobileField}
              </>
            )}

            {accountType === "partner" && (
              <>
                {textField("organisation_name", "Organisation / Business Name", { max: 200, placeholder: "Registered or commonly used name", autoComplete: "organization" })}
                <div className="field">
                  <label htmlFor="partner_type">
                    Engagement Partner Type <span className="req">*</span>
                  </label>
                  <select id="partner_type" name="partner_type" value={values.partner_type} onChange={(e) => change("partner_type", e.target.value)} {...inputProps("partner_type")}>
                    <option value="">Select type</option>
                    {(options?.partner_types ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <FieldError id="partner_type" message={err.partner_type} />
                </div>
                {textField("first_name", L.first, { max: 100, placeholder: "Contact person's first name", autoComplete: "given-name" })}
                {textField("last_name", L.last, { max: 100, placeholder: "Contact person's last name", autoComplete: "family-name" })}
                {textField("designation", "Designation", { max: 100, placeholder: "e.g. Events Manager", autoComplete: "organization-title", optional: true })}
                {mobileField}
                {emailFields}
                {textField("address", "Address", { max: 500, placeholder: "Office / registered address", autoComplete: "street-address", full: true, optional: true })}
              </>
            )}

            {locationFields}
            {passwordFields}
            <CaptchaField captcha={captcha} value={values.captcha} onChange={(v) => change("captcha", v)} error={err.captcha} />
          </div>

          {/* One checkbox for every account type: Terms & Conditions + Privacy Policy. */}
          <label className="terms">
            <input id="terms" name="terms" type="checkbox" checked={values.terms} onChange={(e) => change("terms", e.target.checked)} {...inputProps("terms")} />
            <span>
              I accept the <Link href="/content/terms-conditions" target="_blank">Terms &amp; Conditions</Link> and acknowledge the{" "}
              <Link href="/content/privacy-policy" target="_blank">Privacy Policy</Link>. <span className="req">*</span>
            </span>
          </label>
          <FieldError id="terms" message={err.terms} />

          <div className="bottom">
            <div className="helper">Detailed information will be requested after login.</div>
            <button className="create" type="submit" disabled={submitting || !captcha.key || !options} aria-busy={submitting}>
              {submitting ? "Creating…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>

      <div
        className={`overlay${showSuccess ? " show" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowSuccess(false);
        }}
      >
        <div className="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title">
          <div className="modal-top">
            <div className="check-icon">✓</div>
            <h2 id="success-title">Account Successfully Created</h2>
            <p>Your Opportunity Hub account has been created successfully.</p>
          </div>
          <div className="modal-body">
            <div className="modal-note">
              Your registration is complete. You can now login and complete your profile from your dashboard.
            </div>
            <div className="modal-actions">
              <button className="ok" type="button" onClick={() => router.push("/login")}>
                Go to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
