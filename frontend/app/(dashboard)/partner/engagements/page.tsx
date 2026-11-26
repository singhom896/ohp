import type { Metadata } from "next";
import { EngagementList } from "@/components/console/modules/partner";

export const metadata: Metadata = { title: "Engagement Requests" };

export default function Page() {
  return <EngagementList />;
}