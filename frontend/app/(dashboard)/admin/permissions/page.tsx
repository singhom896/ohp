import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { PermissionsPage } from "@/components/console/modules/permissions";

export const metadata: Metadata = { title: "Role Permissions" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <PermissionsPage />
    </Suspense>
  );
}
