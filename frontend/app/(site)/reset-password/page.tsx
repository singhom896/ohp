// /reset-password?token=...&email=... - set a new password from the emailed link.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Set New Password", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <main id="main-content" className="page">
      <section className="auth-shell">
        <aside className="auth-art">
          <div className="eyebrow">ACCOUNT RECOVERY</div>
          <h2>
            Set a new
            <br />
            password.
          </h2>
          <p>Choose a strong password that you have not used on Opportunity Hub before.</p>
          <ul className="feature-list">
            <li>✓ At least 8 characters</li>
            <li>✓ Upper and lower case letters</li>
            <li>✓ At least one number and one symbol</li>
          </ul>
        </aside>

        <section className="auth-form">
          <h2>New password</h2>
          <p className="muted">Enter and confirm your new password.</p>
          {/* Reads ?token= and ?email= on the client. */}
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <ResetPasswordForm />
          </Suspense>
          <div className="auth-links">
            <Link href="/login">Back to Login</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
