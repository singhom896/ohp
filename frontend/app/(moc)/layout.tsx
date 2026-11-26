// Root layout for the Ministry of Culture design console (/ministry), kept
// separate from app/(dashboard) which now mirrors the Laravel /cp panel.
// Each root layout loads its own stylesheet; navigating between them does a
// full page load, so backend.css never mixes with the console styles.
import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "@/styles/backend.css";
import BootstrapClient from "@/components/BootstrapClient";
import AuthProvider from "@/components/auth/AuthProvider";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DashboardFooter from "@/components/dashboard/DashboardFooter";

export const metadata: Metadata = {
  title: { default: "Opportunity Hub", template: "%s — Opportunity Hub" },
};

export default function MocRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AuthProvider>
          <DashboardHeader />
          <main id="main-content">{children}</main>
          <DashboardFooter />
        </AuthProvider>
        <BootstrapClient />
      </body>
    </html>
  );
}
