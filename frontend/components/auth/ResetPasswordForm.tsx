"use client";

// mode "reset" (default) - step 2 of Forgot Password: the link from the email
// opens /reset-password?token=...&email=... ; the user sets a new password.
// API: POST /api/auth/reset-password/check and /api/auth/reset-password.
//
// mode "setup" - /set-password?token=... from the "Set your password" email
// sent when an administrator creates or imports an account. The check call
// returns the account's email. API: POST /api/auth/password-setup/check and
// /api/auth/password-setup.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api/client";

/** Same policy as Laravel (PasswordRules::min(8)->letters()->mixedCase()->numbers()->symbols()). */
const RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "An uppercase letter (A–Z)", test: (p: string) => /[A-Z]/.test(p) },
  { label: "A lowercase letter (a–z)", test: (p: string) => /[a-z]/.test(p) },
  { label: "A number (0–9)", test: (p: string) => /\d/.test(p) },
  { label: "A symbol (e.g. @ # $ %)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

type Errors = { password?: string; password_confirmation?: string };

function validate(p: string, c: string): Errors {
  const e: Errors = {};
  if (!p) e.password = "Please enter a new password.";
  else if (!RULES.every((r) => r.test(p))) e.password = "The password does not meet all the rules below.";
  if (!c) e.password_confirmation = "Please confirm the new password.";
  else if (c !== p) e.password_confirmation = "New password and confirm password do not match.";
  return e;
}

export default function ResetPasswordForm({ mode = "reset" }: { mode?: "reset" | "setup" }) {
  const setup = mode === "setup";
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState(setup ? "" : params.get("email") ?? "");
  const hasLink = setup ? !!token : !!(token && email);

  const [linkState, setLinkState] = useState<"checking" | "valid" | "invalid">(hasLink ? "checking" : "invalid");
  const [linkMessage, setLinkMessage] = useState(`This password ${setup ? "setup" : "reset"} link is incomplete. Please use the link from your email.`);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Check the link once, so an expired / used link is reported before typing.
  useEffect(() => {
    if (!hasLink) return;
    let alive = true;
    const check = setup
      ? api.post<{ email: string }>("/auth/password-setup/check", { token }).then((res) => alive && setEmail(res.data.email))
      : api.post("/auth/reset-password/check", { email, token });
    check
      .then(() => alive && setLinkState("valid"))
      .catch((err) => {
        if (!alive) return;
        setLinkMessage(err instanceof ApiError ? err.message : "This link could not be checked. Please try again.");
        setLinkState("invalid");
      });
    return () => { alive = false; };
    // email is fixed for "reset" and filled by the check for "setup".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hasLink, setup]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    const errs = validate(password, confirm);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(errs.password ? "rp-password" : "rp-confirm")?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = setup
        ? await api.post("/auth/password-setup", { token, password, password_confirmation: confirm })
        : await api.post("/auth/reset-password", { email, token, password, password_confirmation: confirm });
      setDone(res.message);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_reset_link" || err.code === "invalid_setup_link") {
          setLinkMessage(err.message);
          setLinkState("invalid");
        } else {
          setError(err.message);
          setErrors({ password: err.field("password"), password_confirmation: err.field("password_confirmation") });
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="auth-done" role="status">
        <div className="auth-done-icon ok" aria-hidden="true"><i className="bi bi-shield-check" /></div>
        <h3>{setup ? "Account activated" : "Password changed"}</h3>
        <p>{done}</p>
        <div className="auth-done-actions">
          <Link className="submit as-link" href="/login?reset=1">Go to Login</Link>
        </div>
      </div>
    );
  }

  if (linkState === "checking") {
    return <p className="muted" role="status"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />Checking your link…</p>;
  }

  if (linkState === "invalid") {
    return (
      <div className="auth-done" role="alert">
        <div className="auth-done-icon bad" aria-hidden="true"><i className="bi bi-link-45deg" /></div>
        <h3>Link not valid</h3>
        <p>{linkMessage}</p>
        <div className="auth-done-actions">
          <Link className="submit as-link" href="/forgot-password">Request a new link</Link>
          <Link className="link-btn" href="/login">Back to Login</Link>
        </div>
      </div>
    );
  }

  const change = (p: string, c: string) => { setPassword(p); setConfirm(c); if (submitted) setErrors(validate(p, c)); };

  return (
    <>
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="rp-email">Email Address</label>
          <input id="rp-email" type="email" value={email} readOnly disabled autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="rp-password">New Password <span className="req">*</span></label>
          <div className="pw-wrap">
            <input
              id="rp-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Enter a new password"
              value={password}
              maxLength={72}
              onChange={(e) => change(e.target.value, confirm)}
              aria-invalid={!!errors.password}
              aria-describedby="rp-rules"
            />
            <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
              <i className={`bi ${show ? "bi-eye-slash" : "bi-eye"}`} aria-hidden="true" />
            </button>
          </div>
          {errors.password && <div className="text-danger small mt-1">{errors.password}</div>}
          <ul className="pw-rules" id="rp-rules" aria-live="polite">
            {RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li key={r.label} className={ok ? "ok" : ""}>
                  <i className={`bi ${ok ? "bi-check-circle-fill" : "bi-circle"}`} aria-hidden="true" /> {r.label}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="field">
          <label htmlFor="rp-confirm">Confirm New Password <span className="req">*</span></label>
          <input
            id="rp-confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter the new password"
            value={confirm}
            maxLength={72}
            onChange={(e) => change(password, e.target.value)}
            aria-invalid={!!errors.password_confirmation}
          />
          {errors.password_confirmation && <div className="text-danger small mt-1">{errors.password_confirmation}</div>}
        </div>
        <div className="field">
          <button className="submit" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Saving…" : setup ? "Set Password" : "Reset Password"}
          </button>
        </div>
      </form>
    </>
  );
}
