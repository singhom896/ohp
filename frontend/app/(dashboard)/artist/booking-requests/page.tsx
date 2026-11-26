import type { Metadata } from "next";
import { OpportunityList } from "@/components/console/modules/bookings";

export const metadata: Metadata = { title: "Booking Requests" };

export default function Page() {
  return <OpportunityList tab="requests" />;
}