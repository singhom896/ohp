import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { EngagementPartnerView } from "@/components/console/modules/admin-partners";

export const metadata: Metadata = { title: "Engagement Partner" };

// Reads search params, so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <EngagementPartnerView />
    </Suspense>
  );
}