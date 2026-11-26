import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { ModulesList } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Module Management" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <ModulesList />
    </Suspense>
  );
}
