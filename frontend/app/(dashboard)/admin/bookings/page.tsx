import type { Metadata } from "next";
import { BookingRequirements } from "@/components/console/modules/bookings";

export const metadata: Metadata = { title: "Booking Management" };

export default function Page() {
  return <BookingRequirements />;
}
