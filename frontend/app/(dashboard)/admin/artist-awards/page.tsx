import type { Metadata } from "next";
import { ArtistAwardsList } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Artist Awards Management" };

export default function Page() {
  return <ArtistAwardsList />;
}
