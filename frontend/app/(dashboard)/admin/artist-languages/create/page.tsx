import type { Metadata } from "next";
import { ArtistLanguagesCreate } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Create Language" };

export default function Page() {
  return <ArtistLanguagesCreate />;
}
