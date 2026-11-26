import type { Metadata } from "next";
import { ArtistLanguagesList } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Artist Languages Management" };

export default function Page() {
  return <ArtistLanguagesList />;
}
