import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { ArtistGroupsEdit } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Edit Artist Group Type" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <ArtistGroupsEdit />
    </Suspense>
  );
}
