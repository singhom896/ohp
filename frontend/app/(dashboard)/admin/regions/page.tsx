import type { Metadata } from "next";
import { RegionsList } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Region Management" };

export default function Page() {
  return <RegionsList />;
}
