// /forgot-password - ask for a password reset link (email + captcha).
import type { Metadata } from "next";
import Link from "next/link";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot Password" };

export default function ForgotPasswordPage() {
  return (
    <main id="main-content" className="page">
      <section className="auth-shell">
        <aside className="auth-art">
          <div className="eyebrow">ACCOUNT RECOVERY</div>
          <h2>
            Forgot your
            <br />
            password?
          </h2>
          <p>Enter the email address you registered with. We will email you a secure link to set a new password.</p>
          <ul className="feature-list">
            <li>✓ The link is valid for 60 minutes</li>
            <li>✓ It can be used only once</li>
            <li>✓ Your current password keeps working until you change it</li>
          </ul>
        </aside>

        <section className="auth-form">
          <h2>Reset password</h2>
          <p className="muted">We&apos;ll send a reset link to your registered email.</p>
          <ForgotPasswordForm />
          <div className="auth-links">
            <span className="muted">Remembered it?</span> <Link href="/login">Back to Login</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
