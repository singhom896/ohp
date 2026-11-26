import type { Metadata } from "next";
import { ArtistGroupsCreate } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Create Artist Group Type" };

export default function Page() {
  return <ArtistGroupsCreate />;
}
