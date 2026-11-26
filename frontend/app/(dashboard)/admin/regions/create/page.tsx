import type { Metadata } from "next";
import { RegionsCreate } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Create Region" };

export default function Page() {
  return <RegionsCreate />;
}
