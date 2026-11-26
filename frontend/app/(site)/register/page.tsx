import type { Metadata } from "next";
import { Suspense } from "react";
import RegisterChooser from "@/components/auth/RegisterChooser";

export const metadata: Metadata = { title: "Registration" };

export default function RegisterPage() {
  return (
    <main id="main-content" className="page">
      <section className="register-card">
        {/* Reads ?as=artist|partner, so it renders inside <Suspense>. */}
        <Suspense fallback={<div className="intro"><h1>Create your Opportunity Hub account</h1></div>}>
          <RegisterChooser />
        </Suspense>
      </section>
    </main>
  );
}
