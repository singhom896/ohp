// Root layout for the public website (/, /login, /register).
// The dashboards have their own root layout in app/(dashboard), so frontend.css
// and backend.css are never loaded on the same page (they define conflicting
// global rules such as body, .btn, .stat and .section).
import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.min.css"; // same icon set as the admin console
import "@/styles/vendor/ux4g/accesibility-style-v2.1.css"; // UX4G accessibility widget (downloaded copy)
import "@/styles/frontend.css";
import BootstrapClient from "@/components/BootstrapClient";
import AccessibilityPanel from "@/components/site/AccessibilityPanel";
import AuthProvider from "@/components/auth/AuthProvider";
import GovStrip from "@/components/site/GovStrip";
import MainNav from "@/components/site/MainNav";
import SiteFooter from "@/components/site/SiteFooter";

export const metadata: Metadata = {
  title: { default: "Opportunity Hub — For Indian Artists", template: "%s — Opportunity Hub" },
  description:
    "A one-stop platform connecting Indian artists with performance opportunities at hotels, weddings, festivals and government programmes.",
};

// Same typeface as the Laravel website (style.css --sans: "DM Sans"); self-hosted by next/font.
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans" });

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body suppressHydrationWarning>
        <AuthProvider>
          <GovStrip />
          <MainNav />
          {children}
          <SiteFooter />
        </AuthProvider>
        <BootstrapClient />
        {/* UX4G Accessibility options (opened from the gov strip). Local copies:
            CSS + fonts in styles/vendor/ux4g, script in public/vendor/ux4g-accessibility. */}
        <AccessibilityPanel />
        <Script src="/vendor/ux4g-accessibility/weights-v1.js" strategy="afterInteractive" />
        {/* BHASHINI Translation Plugin: fills .bhashini-plugin-container (GovTools.tsx)
            with the language picker. It rewrites the page text (and adds
            bhashini-* / data-translation-id attributes) as soon as it runs when a
            language is saved, so it must run only after React has hydrated the
            page: "lazyOnload" waits for the window load event and idle time.
            Loading it earlier causes React hydration-mismatch errors. */}
        <Script src="https://translation-plugin.bhashini.co.in/v3/website_translation_utility.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
