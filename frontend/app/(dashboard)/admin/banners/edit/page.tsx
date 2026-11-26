import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { BannersEdit } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Edit Banner" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <BannersEdit />
    </Suspense>
  );
}
