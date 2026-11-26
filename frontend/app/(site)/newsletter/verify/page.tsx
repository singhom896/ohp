import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsletterVerify } from "@/components/site/NewsletterActions";

export const metadata: Metadata = { title: "Confirm Newsletter Subscription", robots: { index: false } };

export default function Page() {
  return (
    <main id="main-content" className="page">
      <section className="auth-shell">
        <aside className="auth-art">
          <div className="eyebrow">NEWSLETTER</div>
          <h2>
            Stay in
            <br />
            the loop.
          </h2>
          <p>Get upcoming cultural events and opportunities from Opportunity Hub in your inbox.</p>
        </aside>
        <section className="auth-form">
          <h2>Confirm subscription</h2>
          {/* Reads the link parameters on the client. */}
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <NewsletterVerify />
          </Suspense>
        </section>
      </section>
    </main>
  );
}