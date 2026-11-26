import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsletterUnsubscribe } from "@/components/site/NewsletterActions";

export const metadata: Metadata = { title: "Unsubscribe from Newsletter", robots: { index: false } };

export default function Page() {
  return (
    <main id="main-content" className="page">
      <section className="auth-shell">
        <aside className="auth-art">
          <div className="eyebrow">NEWSLETTER</div>
          <h2>
            Sorry to
            <br />
            see you go.
          </h2>
          <p>You can subscribe again at any time from the website footer.</p>
        </aside>
        <section className="auth-form">
          <h2>Unsubscribe</h2>
          {/* Reads the link parameters on the client. */}
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <NewsletterUnsubscribe />
          </Suspense>
        </section>
      </section>
    </main>
  );
}