// Root layout for every after-login page (/admin/*, /artist/*): the Laravel
// /cp panel (backend/resources/views/backend/layouts/app.blade.php) in React.
//
// Its own root layout, separate from app/(site) and app/(moc), so the panel's
// style.css never mixes with the public site styles.
import type { Metadata } from "next";
import Script from "next/script";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.min.css";
import "@/styles/console/style.css";
import "@/styles/console/responsive.css";
import "@/styles/console/console.css";
import "@/styles/console/theme.css";
import BootstrapClient from "@/components/BootstrapClient";
import { AuthProvider } from "@/context/AuthContext";
import { ConsoleProvider } from "@/context/ConsoleContext";
import ConsoleShell from "@/components/console/ConsoleShell";

export const metadata: Metadata = {
  title: { default: "Opportunity Hub", template: "%s — Opportunity Hub" },
  robots: { index: false, follow: false },
};

export default function ConsoleRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Same fonts the panel's style.css imported. style.css names the family
            "Noto Sans" literally, so next/font (hashed family names) can't be used.
            This is the root layout, so the rule's pages/_document concern doesn't apply. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          <ConsoleProvider>
            <ConsoleShell>{children}</ConsoleShell>
          </ConsoleProvider>
        </AuthProvider>
        <BootstrapClient />
        {/* BHASHINI Translation Plugin, as on the public site (app/(site)/layout.tsx):
            fills .bhashini-plugin-container in the Topbar with the language picker.
            The chosen language is stored by the plugin per origin, so a language
            picked before login stays active on every dashboard (Artist, Engagement
            Partner, ZCC, Admin, Super Admin). "lazyOnload" = after hydration, to
            avoid React hydration mismatches when it rewrites the page text. */}
        <Script src="https://translation-plugin.bhashini.co.in/v3/website_translation_utility.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
