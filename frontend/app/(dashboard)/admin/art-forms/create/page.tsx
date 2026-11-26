import type { Metadata } from "next";
import { ArtFormsCreate } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Create Art Form" };

export default function Page() {
  return <ArtFormsCreate />;
}
