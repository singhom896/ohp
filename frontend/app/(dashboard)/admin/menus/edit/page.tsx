import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { MenusEdit } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Edit Menu" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <MenusEdit />
    </Suspense>
  );
}
