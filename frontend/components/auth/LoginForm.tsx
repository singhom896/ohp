"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/components/auth/AuthProvider";
import CaptchaField, { useCaptcha } from "@/components/auth/Captcha";

type Field = "login" | "password" | "captcha";
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;

/** Client-side checks; the same rules are enforced again by Laravel. */
function validate(v: Values): Errors {
  const errs: Errors = {};
  if (!v.login.trim()) errs.login = "Please enter your registered mobile number or email.";
  if (!v.password) errs.password = "Please enter your password.";
  if (!v.captcha.trim()) errs.captcha = "Please enter the CAPTCHA code.";
  return errs;
}

export default function LoginForm() {
  const { login } = useAuth();
  const captcha = useCaptcha();
  const [values, setValues] = useState<Values>({ login: "", password: "", captcha: "" });
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);

  // proxy.ts / AuthProvider add ?reason=expired when a session ran out;
  // /reset-password sends ?reset=1 after a password change.
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const msg = q.get("reason") === "expired" ? "Your session has expired. Please log in again." : null;
    const ok = q.get("reset") === "1" ? "Your password has been reset. Please log in with your new password." : null;
    if (!msg && !ok) return;
    const t = window.setTimeout(() => { setNotice(msg); setSuccess(ok); }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // After the first submit, re-check as the user types so errors clear live.
  const change = (field: Field, value: string) => {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setFieldErrors(validate(next));
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    setNotice(null);

    const errs = validate(values);
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(errs.login ? "login-id" : errs.password ? "login-password" : "captcha")?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await login(values.login.trim(), values.password, remember, { captcha: values.captcha.trim(), captcha_key: captcha.key });
      // AuthProvider redirects to ?next= or the role's dashboard.
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors({ login: err.field("login"), password: err.field("password"), captcha: err.field("captcha") ?? err.field("captcha_key") });
      } else {
        setError("Something went wrong. Please try again.");
      }
      // A captcha key works once: always load a new one after a failed attempt.
      setValues((v) => ({ ...v, captcha: "" }));
      captcha.refresh();
      setSubmitting(false);
    }
  };

  return (
    <>
      {notice && (
        <div className="alert alert-warning py-2" role="status">
          {notice}
        </div>
      )}
      {success && !error && (
        <div className="alert alert-success py-2" role="status">
          {success}
        </div>
      )}
      {error && (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="login-id">Mobile Number / Email</label>
          <input
            id="login-id"
            name="login"
            type="text"
            autoComplete="username"
            placeholder="Enter registered mobile number or email"
            value={values.login}
            onChange={(e) => change("login", e.target.value)}
            aria-invalid={!!fieldErrors.login}
            aria-describedby={fieldErrors.login ? "login-id-error" : undefined}
          />
          {fieldErrors.login && (
            <div id="login-id-error" className="text-danger small mt-1">
              {fieldErrors.login}
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter password"
            value={values.password}
            onChange={(e) => change("password", e.target.value)}
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
          />
          {fieldErrors.password && (
            <div id="login-password-error" className="text-danger small mt-1">
              {fieldErrors.password}
            </div>
          )}
        </div>

        <CaptchaField
          captcha={captcha}
          value={values.captcha}
          onChange={(v) => change("captcha", v)}
          error={fieldErrors.captcha}
        />

        <div className="field">
          <label className="check">
            <input type="checkbox" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{" "}
            Remember me
          </label>
        </div>
        <div className="field">
          <button className="submit" type="submit" disabled={submitting || !captcha.key} aria-busy={submitting}>
            {submitting ? "Signing in…" : "Login Securely"}
          </button>
        </div>
      </form>
    </>
  );
}
