import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { MenusList } from "@/components/console/modules/admin";

export const metadata: Metadata = { title: "Menu Management" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <MenusList />
    </Suspense>
  );
}
