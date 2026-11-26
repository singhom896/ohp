import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { RolesEdit } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Edit Role" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <RolesEdit />
    </Suspense>
  );
}
