import type { Metadata } from "next";
import { ArtistInstitutionList } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Artist Institution Type Management" };

export default function Page() {
  return <ArtistInstitutionList />;
}
