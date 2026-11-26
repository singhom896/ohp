import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Login" };

export default function LoginPage() {
  return (
    <main id="main-content" className="page">
      <section className="auth-shell">
        <aside className="auth-art">
          <div className="eyebrow">SECURE ACCESS</div>
          <h2>
            Welcome back to
            <br />
            Opportunity Hub.
          </h2>
          <p>Access role-specific services for artists, organizers and Zonal Cultural Centre administration.</p>
          <ul className="feature-list">
            <li>✓ Artist profile and opportunity applications</li>
            <li>✓ Organizer opportunity management</li>
            <li>✓ ZCC-Admin scrutiny and workflow</li>
            <li>✓ Secure role-based dashboards</li>
          </ul>
        </aside>

        <section className="auth-form">
          <h2>Sign in</h2>
          <p className="muted">Enter your registered credentials.</p>
          <LoginForm />
          <div className="auth-links">
            <Link href="/forgot-password">Forgot Password?</Link>
            <br />
            <span className="muted">New user?</span> <Link href="/register">Register on Opportunity Hub</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
