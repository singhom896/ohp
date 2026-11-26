import type { Metadata } from "next";
import { PartnerBookings } from "@/components/console/modules/partner";

export const metadata: Metadata = { title: "Bookings & History" };

export default function Page() {
  return <PartnerBookings />;
}