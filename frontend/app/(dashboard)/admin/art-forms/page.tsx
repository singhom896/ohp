import type { Metadata } from "next";
import { ArtFormsList } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Art Forms Management" };

export default function Page() {
  return <ArtFormsList />;
}
