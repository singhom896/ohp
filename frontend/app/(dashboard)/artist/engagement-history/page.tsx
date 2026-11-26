import type { Metadata } from "next";
import { OpportunityList } from "@/components/console/modules/bookings";

export const metadata: Metadata = { title: "Engagement History" };

export default function Page() {
  return <OpportunityList tab="history" />;
}