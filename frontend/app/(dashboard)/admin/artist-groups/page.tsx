import type { Metadata } from "next";
import { ArtistGroupsList } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Artist Group Type Management" };

export default function Page() {
  return <ArtistGroupsList />;
}
