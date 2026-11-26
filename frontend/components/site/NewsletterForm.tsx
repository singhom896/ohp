"use client";

// Footer "Stay in the Loop": POST /api/public/newsletter/subscribe (BFF ->
// Laravel). The visitor gets a confirmation email; the subscription is active
// only after they click the link (/newsletter/verify).
import { useState } from "react";
import { http } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setMsg({ ok: false, text: "Please enter a valid email address." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await http.post("/public/newsletter/subscribe", { email: value });
      setMsg({ ok: true, text: res.message || "Please check your inbox to confirm your subscription." });
      setEmail("");
    } catch (ex) {
      const text = ex instanceof ApiError
        ? (ex.status === 429 ? "Too many attempts. Please try again in a few minutes." : ex.errors.email?.[0] ?? ex.message)
        : "Something went wrong. Please try again.";
      setMsg({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="newsletter-form" onSubmit={submit} noValidate>
        <input
          type="email"
          name="email"
          placeholder="Your email address"
          aria-label="Your email address"
          autoComplete="email"
          maxLength={191}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={msg && !msg.ok ? true : undefined}
          aria-describedby="newsletter-msg"
        />
        <button type="submit" disabled={busy}>
          {busy ? "Joining…" : "Join"} <i className="bi bi-arrow-right" aria-hidden="true" />
        </button>
      </form>
      <p id="newsletter-msg" className={`newsletter-msg${msg ? (msg.ok ? " ok" : " err") : ""}`} role="status" aria-live="polite">
        {msg?.text}
      </p>
    </>
  );
}
