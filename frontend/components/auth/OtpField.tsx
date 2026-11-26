"use client";

// Email or Mobile number + its OTP step, for the registration form.
//   Send OTP -> enter 6 digits -> Verify -> value locked, `token` handed to the parent.
// Laravel: POST /registration/otp/{email|mobile}/send | /verify
// (Api\V1\RegistrationController). The token is single use and spent by
// /auth/register. When a channel is switched off (backend config/otp.php) the
// parent renders a plain input instead of this component.
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";

type Channel = "email" | "mobile";

const CHANNEL: Record<Channel, { label: string; valid: (v: string) => boolean; invalidMsg: string; what: string }> = {
  email: {
    label: "Email Address",
    valid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    invalidMsg: "Please enter a valid email address first.",
    what: "Email",
  },
  mobile: {
    label: "Mobile Number",
    valid: (v) => /^[6-9][0-9]{9}$/.test(v.trim()),
    invalidMsg: "Please enter a valid 10-digit mobile number first.",
    what: "Mobile number",
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

export default function OtpField({ channel, value, onValueChange, token, onToken, valueError, otpError, label }: Props) {
  const cfg = CHANNEL[channel];
  const id = channel; // input ids: "email" / "mobile", OTP: "email_otp" / "mobile_otp"
  const otpId = `${channel}_otp`;

  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const verified = token !== "";

  const send = async () => {
    if (!cfg.valid(value)) {
      setMessage({ text: cfg.invalidMsg, error: true });
      return;
    }
    setBusy("send");
    setMessage(null);
    try {
      const res = await api.post<{ resend_after: number; debug_otp?: string }>(`/registration/otp/${channel}/send`, { [channel]: value.trim() });
      setSent(true);
      setOtp("");
      setCooldown(res.data.resend_after ?? 60);
      setDevOtp(res.data.debug_otp ?? null);
      setMessage({ text: res.message, error: false });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      const wait = Number(err?.errors?.retry_after?.[0]);
      if (wait) setCooldown(wait);
      setMessage({ text: err?.field(channel) ?? err?.message ?? "Unable to send OTP.", error: true });
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setMessage({ text: "Please enter the 6-digit OTP.", error: true });
      return;
    }
    setBusy("verify");
    setMessage(null);
    try {
      const res = await api.post<{ otp_token: string }>(`/registration/otp/${channel}/verify`, { [channel]: value.trim(), otp });
      onToken(res.data.otp_token);
      setSent(false);
      setDevOtp(null);
      setMessage({ text: res.message, error: false });
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.field("otp") ?? e.message : "Unable to verify OTP.", error: true });
    } finally {
      setBusy(null);
    }
  };

  const change = () => {
    onToken("");
    setSent(false);
    setOtp("");
    setDevOtp(null);
    setMessage(null);
  };

  return (
    <>
      <div className="field">
        <label htmlFor={id}>
          {label ?? cfg.label} <span className="req">*</span>
        </label>
        <div className="otp-row">
          {channel === "email" ? (
            <input
              id={id}
              name="email"
              type="email"
              maxLength={255}
              autoComplete="email"
              placeholder="name@example.com"
              value={value}
              readOnly={verified}
              onChange={(e) => {
                onValueChange(e.target.value);
                if (sent) setSent(false);
              }}
              aria-invalid={!!valueError}
              aria-describedby={valueError ? `${id}-error` : undefined}
            />
          ) : (
            <input
              id={id}
              name="mobile"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
              placeholder="10-digit mobile number"
              value={value}
              readOnly={verified}
              // Digits only, like the backend rule.
              onChange={(e) => {
                onValueChange(e.target.value.replace(/\D/g, ""));
                if (sent) setSent(false);
              }}
              aria-invalid={!!valueError}
              aria-describedby={valueError ? `${id}-error` : undefined}
            />
          )}
          {verified ? (
            <button type="button" className="otp-btn ghost" onClick={change}>
              Change
            </button>
          ) : (
            <button type="button" className="otp-btn" onClick={send} disabled={busy !== null || cooldown > 0 || !value.trim()}>
              {busy === "send" ? "Sending…" : sent ? (cooldown > 0 ? `Resend (${cooldown}s)` : "Resend OTP") : "Send OTP"}
            </button>
          )}
        </div>
        {verified && (
          <div className="otp-ok small mt-1">
            <span aria-hidden="true">✓</span> {cfg.what} verified
          </div>
        )}
        {valueError && (
          <div id={`${id}-error`} className="text-danger small mt-1">
            {valueError}
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor={otpId}>
          {channel === "email" ? "Email OTP" : "Mobile OTP"} <span className="req">*</span>
        </label>
        {verified ? (
          <input id={otpId} type="text" value="Verified" readOnly className="otp-verified" />
        ) : (
          <div className="otp-row">
            <input
              id={otpId}
              name={otpId}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={sent ? "Enter 6-digit OTP" : "Click “Send OTP” first"}
              value={otp}
              disabled={!sent}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  verify();
                }
              }}
              aria-invalid={!!otpError}
              aria-describedby={otpError ? `${otpId}-error` : undefined}
            />
            <button type="button" className="otp-btn" onClick={verify} disabled={!sent || busy !== null || otp.length !== 6}>
              {busy === "verify" ? "Verifying…" : "Verify"}
            </button>
          </div>
        )}
        {message && (
          <div className={`small mt-1 ${message.error ? "text-danger" : "otp-ok"}`} role="status">
            {message.text}
          </div>
        )}
        {devOtp && (
          <div className="small mt-1 text-muted">
            Local testing only — OTP: <b>{devOtp}</b>
          </div>
        )}
        {otpError && !verified && (
          <div id={`${otpId}-error`} className="text-danger small mt-1">
            {otpError}
          </div>
        )}
      </div>
    </>
  );
}
