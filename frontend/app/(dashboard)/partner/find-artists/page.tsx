import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/console/ui/PageHeader";
import { ArtistSearch } from "@/components/console/modules/partner";

export const metadata: Metadata = { title: "Search Artists" };

// Reads search params, so it renders inside <Suspense>.
export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <ArtistSearch />
    </Suspense>
  );
}