import type { Metadata } from "next";
import { Shortlist } from "@/components/console/modules/partner";

export const metadata: Metadata = { title: "Shortlisted Artists" };

export default function Page() {
  return <Shortlist />;
}