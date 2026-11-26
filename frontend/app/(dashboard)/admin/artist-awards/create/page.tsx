import type { Metadata } from "next";
import { ArtistAwardsCreate } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Create Award" };

export default function Page() {
  return <ArtistAwardsCreate />;
}
