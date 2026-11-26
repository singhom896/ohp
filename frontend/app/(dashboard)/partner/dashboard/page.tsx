import type { Metadata } from "next";
import { PartnerDashboard } from "@/components/console/modules/partner";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return <PartnerDashboard />;
}