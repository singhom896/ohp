import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { ArtFormsEdit } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Edit Art Form" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <ArtFormsEdit />
    </Suspense>
  );
}
