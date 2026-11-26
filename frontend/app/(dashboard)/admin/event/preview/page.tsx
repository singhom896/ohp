import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { EventPreview } from "@/components/console/modules/events";

export const metadata: Metadata = { title: "Event Preview" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <EventPreview />
    </Suspense>
  );
}
