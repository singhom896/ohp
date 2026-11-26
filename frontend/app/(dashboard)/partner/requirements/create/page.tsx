import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { RequirementForm } from "@/components/console/modules/bookings";

export const metadata: Metadata = { title: "Post an Opportunity" };

// Reads search params, so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <RequirementForm />
    </Suspense>
  );
}