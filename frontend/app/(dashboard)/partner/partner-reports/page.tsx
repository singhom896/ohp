import type { Metadata } from "next";
import { PartnerReports } from "@/components/console/modules/partner";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <PartnerReports />;
}