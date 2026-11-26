import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { NewsletterEventHistory } from "@/components/console/modules/newsletter";

export const metadata: Metadata = { title: "Event Email Deliveries" };

// Reads search params (?id= / ?status=), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <NewsletterEventHistory />
    </Suspense>
  );
}
