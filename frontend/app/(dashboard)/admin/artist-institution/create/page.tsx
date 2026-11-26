import type { Metadata } from "next";
import { ArtistInstitutionCreate } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Create Institution Type" };

export default function Page() {
  return <ArtistInstitutionCreate />;
}
