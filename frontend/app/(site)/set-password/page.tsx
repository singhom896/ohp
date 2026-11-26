// /set-password?token=... - first password for an account created by an
// administrator (Artist Management create form or bulk import).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Set Your Password", robots: { index: false } };

export default function SetPasswordPage() {
  return (
    <main id="main-content" className="page">
      <section className="auth-shell">
        <aside className="auth-art">
          <div className="eyebrow">ACCOUNT ACTIVATION</div>
          <h2>
            Set your
            <br />
            password.
          </h2>
          <p>Your Opportunity Hub account has been created. Choose a password to activate it.</p>
          <ul className="feature-list">
            <li>✓ At least 8 characters</li>
            <li>✓ Upper and lower case letters</li>
            <li>✓ At least one number and one symbol</li>
          </ul>
        </aside>

        <section className="auth-form">
          <h2>Set password</h2>
          <p className="muted">Enter and confirm your password.</p>
          {/* Reads ?token= on the client. */}
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <ResetPasswordForm mode="setup" />
          </Suspense>
          <div className="auth-links">
            <Link href="/login">Back to Login</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
