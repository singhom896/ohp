import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { ArtistPreview } from "@/components/console/modules/artists";

export const metadata: Metadata = { title: "Artist Registration Preview" };

// Reads search params (?id= / filters), so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <ArtistPreview />
    </Suspense>
  );
}
