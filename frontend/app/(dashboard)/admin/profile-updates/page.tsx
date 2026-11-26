import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { ProfileUpdateList } from "@/components/console/modules/applications";

export const metadata: Metadata = { title: "Profile Update Requests" };

// Reads search params (?id= / ?status=), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <ProfileUpdateList />
    </Suspense>
  );
}
