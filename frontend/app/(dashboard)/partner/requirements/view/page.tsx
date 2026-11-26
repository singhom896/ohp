import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { RequirementView } from "@/components/console/modules/bookings";

export const metadata: Metadata = { title: "Opportunity" };

// Reads search params, so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <RequirementView />
    </Suspense>
  );
}