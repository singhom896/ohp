import type { Metadata } from "next";
import { ReportsOverview } from "@/components/console/modules/admin-partners";

export const metadata: Metadata = { title: "Reports & MIS" };

export default function Page() {
  return <ReportsOverview />;
}