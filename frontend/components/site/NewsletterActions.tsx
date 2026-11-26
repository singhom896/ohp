"use client";

// Landing pages for the newsletter email links:
//   /newsletter/verify?token=           confirms the subscription (runs on load)
//   /newsletter/unsubscribe?id=&token=  shows the email, unsubscribes on click
// Backend: Api\V1\NewsletterController (public, via the /api BFF).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { http } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";

type State = { kind: "loading" | "ok" | "error" | "ready"; text: string };

const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiError ? (e.status === 429 ? "Too many attempts. Please try again later." : e.message) : fallback;

function Result({ state }: { state: State }) {
  if (state.kind === "loading") return <p className="muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />{state.text}</p>;
  return (
    <div className={`nl-result ${state.kind === "ok" ? "ok" : state.kind === "error" ? "err" : ""}`} role="status">
      <i className={`bi ${state.kind === "ok" ? "bi-check-circle-fill" : state.kind === "error" ? "bi-exclamation-triangle-fill" : "bi-envelope"}`} aria-hidden="true" />
      <span>{state.text}</span>
    </div>
  );
}

export function NewsletterVerify() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "loading", text: "Confirming your subscription…" });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode runs effects twice in development
    ran.current = true;
    const t = window.setTimeout(async () => {
      if (!token) {
        setState({ kind: "error", text: "This confirmation link is incomplete. Please use the link from your email." });
        return;
      }
      try {
        const res = await http.post("/public/newsletter/verify", { token });
        setState({ kind: "ok", text: res.message || "Your subscription is confirmed." });
      } catch (e) {
        setState({ kind: "error", text: errorText(e, "We could not confirm your subscription. Please try again.") });
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [token]);

  return (
    <>
      <Result state={state} />
      {state.kind !== "loading" && (
        <div className="auth-links">
          <Link href="/events">Browse upcoming events</Link>
          <Link href="/">Back to Home</Link>
        </div>
      )}
    </>
  );
}

export function NewsletterUnsubscribe() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  const token = sp.get("token") ?? "";
  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "loading", text: "Checking your link…" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      if (!id || !token) {
        setState({ kind: "error", text: "This unsubscribe link is incomplete. Please use the link from your email." });
        return;
      }
      try {
        const res = await http.get<{ email: string; unsubscribed: boolean }>(`/public/newsletter/unsubscribe?${new URLSearchParams({ id, token })}`);
        setEmail(res.data.email);
        setState(res.data.unsubscribed
          ? { kind: "ok", text: "This email address is already unsubscribed. You will not receive newsletter emails." }
          : { kind: "ready", text: "Do you want to stop receiving Opportunity Hub newsletter emails?" });
      } catch (e) {
        setState({ kind: "error", text: errorText(e, "This unsubscribe link is invalid.") });
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [id, token]);

  async function confirm() {
    setBusy(true);
    try {
      const res = await http.post("/public/newsletter/unsubscribe", { id: Number(id), token });
      setState({ kind: "ok", text: res.message || "You have been unsubscribed." });
    } catch (e) {
      setState({ kind: "error", text: errorText(e, "We could not unsubscribe you. Please try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {email && <p className="nl-email"><i className="bi bi-envelope me-2" aria-hidden="true" />{email}</p>}
      <Result state={state} />
      {state.kind === "ready" && (
        <button type="button" className="submit nl-btn" disabled={busy} onClick={confirm}>
          {busy ? "Unsubscribing…" : "Yes, unsubscribe me"}
        </button>
      )}
      {state.kind !== "loading" && (
        <div className="auth-links">
          <Link href="/">Back to Home</Link>
        </div>
      )}
    </>
  );
}
