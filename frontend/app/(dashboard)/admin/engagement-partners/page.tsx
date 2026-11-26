import type { Metadata } from "next";
import { EngagementPartnerList } from "@/components/console/modules/admin-partners";

export const metadata: Metadata = { title: "Engagement Partners" };

export default function Page() {
  return <EngagementPartnerList />;
}