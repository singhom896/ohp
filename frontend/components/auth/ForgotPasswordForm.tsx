"use client";

// Step 1 of Forgot Password: registered email + captcha -> reset link by email.
// API: POST /api/auth/forgot-password (Laravel PasswordResetController@forgot).
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api/client";
import CaptchaField, { useCaptcha } from "@/components/auth/Captcha";

type Errors = { email?: string; captcha?: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(email: string, code: string): Errors {
  const e: Errors = {};
  if (!email.trim()) e.email = "Please enter your registered email address.";
  else if (!EMAIL_RE.test(email.trim())) e.email = "Please enter a valid email address.";
  if (!code.trim()) e.captcha = "Please enter the CAPTCHA code.";
  return e;
}

export default function ForgotPasswordForm() {
  const captcha = useCaptcha();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    const errs = validate(email, code);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(errs.email ? "fp-email" : "captcha")?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/auth/forgot-password", { email: email.trim(), captcha: code.trim(), captcha_key: captcha.key });
      setSent(res.message);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors({ email: err.field("email"), captcha: err.field("captcha") ?? err.field("captcha_key") });
      } else {
        setError("Something went wrong. Please try again.");
      }
      // A captcha key works once: load a new one after every failed attempt.
      setCode("");
      captcha.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-done" role="status">
        <div className="auth-done-icon" aria-hidden="true"><i className="bi bi-envelope-check" /></div>
        <h3>Check your email</h3>
        <p>{sent}</p>
        <p className="muted small">The link is valid for 60 minutes and can be used once. Didn&apos;t get it? Wait a minute and try again.</p>
        <div className="auth-done-actions">
          <Link className="submit as-link" href="/login">Back to Login</Link>
          <button type="button" className="link-btn" onClick={() => { setSent(null); setCode(""); setSubmitted(false); captcha.refresh(); }}>
            Send the link again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="fp-email">Registered Email Address <span className="req">*</span></label>
          <input
            id="fp-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your registered email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (submitted) setErrors(validate(e.target.value, code)); }}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "fp-email-error" : undefined}
          />
          {errors.email && <div id="fp-email-error" className="text-danger small mt-1">{errors.email}</div>}
        </div>

        <CaptchaField captcha={captcha} value={code} onChange={(v) => { setCode(v); if (submitted) setErrors(validate(email, v)); }} error={errors.captcha} />

        <div className="field">
          <button className="submit" type="submit" disabled={busy || !captcha.key} aria-busy={busy}>
            {busy ? "Sending…" : "Send Reset Link"}
          </button>
        </div>
      </form>
    </>
  );
}
