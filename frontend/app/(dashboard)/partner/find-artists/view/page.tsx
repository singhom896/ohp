import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { PartnerArtistView } from "@/components/console/modules/partner";

export const metadata: Metadata = { title: "Artist Profile" };

// Reads search params, so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <PartnerArtistView />
    </Suspense>
  );
}