import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { ProfileUpdateReview } from "@/components/console/modules/applications";

export const metadata: Metadata = { title: "Review Update Request" };

// Reads search params (?id= / ?status=), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <ProfileUpdateReview />
    </Suspense>
  );
}
