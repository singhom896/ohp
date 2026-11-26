import type { Metadata } from "next";
import { OpportunityList } from "@/components/console/modules/bookings";

export const metadata: Metadata = { title: "Saved Opportunities" };

export default function Page() {
  return <OpportunityList tab="saved" />;
}