"use client";

// Email or Mobile number with inline OTP verification, for the registration form.
//
//   1. Not Verified : value + [Send OTP]
//   2. OTP Sent     : value locked (pencil = change it), 6-digit OTP + [Verify OTP],
//                     expiry + resend countdown. A complete 6-digit OTP (typed or
//                     pasted / SMS autofill) is verified automatically.
//   3. Verified     : value locked with a green check; `token` handed to the parent.
//
// Laravel: POST /registration/otp/{email|mobile}/send | /verify
// (Api\V1\RegistrationController). The token is single use and spent by
// /auth/register. When a channel is switched off (backend config/otp.php) the
// parent renders a plain input instead of this component.
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";

type Channel = "email" | "mobile";

const CHANNEL: Record<Channel, { label: string; valid: (v: string) => boolean; invalidMsg: string; what: string; where: string }> = {
  email: {
    label: "Email Address",
    valid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    invalidMsg: "Please enter a valid email address first.",
    what: "Email",
    where: "email address",
  },
  mobile: {
    label: "Mobile Number",
    valid: (v) => /^[6-9][0-9]{9}$/.test(v.trim()),
    invalidMsg: "Please enter a valid 10-digit mobile number first.",
    what: "Mobile number",
    where: "mobile number",
  },
};

type Props = {
  channel: Channel;
  value: string;
  onValueChange: (v: string) => void;
  /** Verified-OTP token, or "" while not verified. */
  token: string;
  onToken: (token: string) => void;
  /** Field-level errors from the parent's validation. */
  valueError?: string;
  otpError?: string;
  label?: string;
};

/** ab•••••@gmail.com / ••••••3210 */
function mask(channel: Channel, v: string): string {
  const s = v.trim();
  if (channel === "mobile") return `+91 ••••••${s.slice(-4)}`;
  const [user, domain] = s.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain ?? ""}`;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export default function OtpField({ channel, value, onValueChange, token, onToken, valueError, otpError, label }: Props) {
  const cfg = CHANNEL[channel];
  const id = channel; // input ids: "email" / "mobile", OTP: "email_otp" / "mobile_otp"
  const otpId = `${channel}_otp`;
  const inputRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [cooldown, setCooldown] = useState(0); // seconds until "Resend" is allowed
  const [expiresIn, setExpiresIn] = useState(0); // seconds until the OTP expires
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const verified = token !== "";
  // A value cleared by the parent (form reset after registering) counts as not sent.
  const state: "idle" | "sent" | "verified" = verified ? "verified" : sent && value !== "" ? "sent" : "idle";

  // One ticking clock for both countdowns.
  useEffect(() => {
    if (cooldown <= 0 && expiresIn <= 0) return;
    const t = window.setTimeout(() => {
      setCooldown((c) => Math.max(0, c - 1));
      setExpiresIn((e) => Math.max(0, e - 1));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [cooldown, expiresIn]);

  const send = async () => {
    if (!cfg.valid(value)) {
      setMessage({ text: cfg.invalidMsg, error: true });
      inputRef.current?.focus();
      return;
    }
    setBusy("send");
    setMessage(null);
    try {
      const res = await api.post<{ resend_after: number; expires_in?: number; debug_otp?: string }>(`/registration/otp/${channel}/send`, { [channel]: value.trim() });
      setSent(true);
      setOtp("");
      setCooldown(res.data.resend_after ?? 60);
      setExpiresIn(res.data.expires_in ?? 600);
      setDevOtp(res.data.debug_otp ?? null);
      setMessage({ text: `OTP sent to ${mask(channel, value)}.`, error: false });
      window.setTimeout(() => otpRef.current?.focus(), 50);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      const wait = Number(err?.errors?.retry_after?.[0]);
      if (wait) {
        setCooldown(wait);
        setSent(true); // an OTP was already sent a moment ago: let the user enter it
      }
      setMessage({ text: err?.field(channel) ?? err?.message ?? "Unable to send OTP. Please try again.", error: true });
    } finally {
      setBusy(null);
    }
  };

  const verify = async (code = otp) => {
    if (!/^\d{6}$/.test(code)) {
      setMessage({ text: "Please enter the 6-digit OTP.", error: true });
      return;
    }
    if (busy) return;
    setBusy("verify");
    setMessage(null);
    try {
      const res = await api.post<{ otp_token: string }>(`/registration/otp/${channel}/verify`, { [channel]: value.trim(), otp: code });
      onToken(res.data.otp_token);
      setSent(false);
      setDevOtp(null);
      setCooldown(0);
      setExpiresIn(0);
      setMessage({ text: `${res.message} You can now submit the registration.`, error: false });
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.field("otp") ?? e.message : "Unable to verify OTP. Please try again.", error: true });
      setOtp("");
      otpRef.current?.focus();
    } finally {
      setBusy(null);
    }
  };

  /** Pencil / "Change": edit the email / mobile again (a new OTP is needed). */
  const edit = () => {
    onToken("");
    setSent(false);
    setOtp("");
    setDevOtp(null);
    setExpiresIn(0);
    setMessage(null);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  const onOtpChange = (raw: string) => {
    const code = raw.replace(/\D/g, "").slice(0, 6);
    setOtp(code);
    if (message?.error) setMessage(null);
    if (code.length === 6) verify(code); // typed, pasted or SMS autofill: verify straight away
  };

  const canSend = cfg.valid(value) && busy === null && cooldown === 0;
  const expired = state === "sent" && expiresIn === 0 && !busy;
  const badge = state === "verified"
    ? { cls: "otp-badge--ok", icon: "bi-patch-check-fill", text: "Verified" }
    : state === "sent"
      ? { cls: "otp-badge--sent", icon: "bi-hourglass-split", text: "OTP Sent" }
      : { cls: "otp-badge--no", icon: "bi-exclamation-circle", text: "Not Verified" };

  const valueInput = channel === "email" ? (
    <input
      ref={inputRef}
      id={id}
      name="email"
      type="email"
      maxLength={255}
      autoComplete="email"
      placeholder="artist@example.com"
      value={value}
      readOnly={state !== "idle"}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); if (canSend) send(); }
      }}
      aria-invalid={!!valueError}
      aria-describedby={valueError ? `${id}-error` : undefined}
    />
  ) : (
    <input
      ref={inputRef}
      id={id}
      name="mobile"
      type="tel"
      inputMode="numeric"
      maxLength={10}
      autoComplete="tel-national"
      placeholder="10-digit mobile number"
      value={value}
      readOnly={state !== "idle"}
      // Digits only, like the backend rule.
      onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); if (canSend) send(); }
      }}
      aria-invalid={!!valueError}
      aria-describedby={valueError ? `${id}-error` : undefined}
    />
  );

  return (
    <div className={`field otp-field is-${state}`}>
      <div className="otp-head">
        <label htmlFor={id}>
          {label ?? cfg.label} <span className="req">*</span>
        </label>
        <span className={`otp-badge ${badge.cls}`} aria-live="polite">
          <i className={`bi ${badge.icon}`} aria-hidden="true" /> {badge.text}
        </span>
      </div>

      <div className="otp-row">
        <div className={`otp-box${channel === "mobile" ? " has-prefix" : ""}`}>
          {channel === "mobile" && <span className="otp-prefix" aria-hidden="true">+91</span>}
          {valueInput}
          {state === "sent" && (
            <button type="button" className="otp-icon-btn" onClick={edit} title={`Change ${cfg.where}`} aria-label={`Change ${cfg.where}`}>
              <i className="bi bi-pencil-square" aria-hidden="true" />
            </button>
          )}
          {state === "verified" && (
            <span className="otp-icon-ok" title={`${cfg.what} verified`}>
              <i className="bi bi-patch-check-fill" aria-hidden="true" />
            </span>
          )}
        </div>
        {state === "idle" && (
          <button type="button" className="otp-btn" onClick={send} disabled={!canSend}>
            {busy === "send" ? <><span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />Sending…</> : cooldown > 0 ? `Send OTP (${cooldown}s)` : "Send OTP"}
          </button>
        )}
      </div>

      {state === "sent" && (
        <div className="otp-step">
          <div className="otp-row">
            <input
              ref={otpRef}
              id={otpId}
              name={otpId}
              className="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Enter OTP"
              value={otp}
              disabled={busy === "verify"}
              onChange={(e) => onOtpChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); verify(); }
              }}
              aria-label={`${cfg.what} OTP`}
              aria-invalid={!!otpError || !!message?.error}
              aria-describedby={`${otpId}-help`}
            />
            <button type="button" className="otp-btn" onClick={() => verify()} disabled={busy !== null || otp.length !== 6}>
              {busy === "verify" ? <><span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />Verifying…</> : "Verify OTP"}
            </button>
          </div>
          <div id={`${otpId}-help`} className="otp-help">
            {expired ? (
              <span className="text-danger">OTP expired. Please resend a new OTP.</span>
            ) : (
              <span>OTP valid for <b>{mmss(expiresIn)}</b>.</span>
            )}{" "}
            {cooldown > 0 ? (
              <span>Resend OTP will be enabled in <b>{cooldown}</b> seconds.</span>
            ) : (
              <button type="button" className="otp-link" onClick={send} disabled={busy !== null}>
                Didn&apos;t get it? Resend OTP
              </button>
            )}
          </div>
        </div>
      )}

      {message && value !== "" && (
        <div className={`otp-msg ${message.error ? "otp-msg--err" : "otp-msg--ok"}`} role="status">
          <i className={`bi ${message.error ? "bi-exclamation-circle-fill" : "bi-check-circle-fill"}`} aria-hidden="true" />
          <span>
            {message.text}
            {state === "verified" && !message.error && (
              <>
                {" "}
                <button type="button" className="otp-link" onClick={edit}>Change {cfg.where}</button>
              </>
            )}
          </span>
        </div>
      )}
      {devOtp && state === "sent" && (
        <div className="otp-dev">
          Local testing only — OTP: <b>{devOtp}</b>
        </div>
      )}
      {valueError && (
        <div id={`${id}-error`} className="text-danger small mt-1">
          {valueError}
        </div>
      )}
      {otpError && !verified && (
        <div id={`${otpId}-error`} className="text-danger small mt-1">
          {otpError}
        </div>
      )}
    </div>
  );
}
