import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { ModulesEdit } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Edit Module" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <ModulesEdit />
    </Suspense>
  );
}
