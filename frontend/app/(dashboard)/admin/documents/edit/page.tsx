import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { DocumentsEdit } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Edit Document" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <DocumentsEdit />
    </Suspense>
  );
}
