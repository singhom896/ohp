import type { Metadata } from "next";
import { BookingConfirmedList } from "@/components/console/modules/bookings";

export const metadata: Metadata = { title: "Bookings" };

export default function Page() {
  return <BookingConfirmedList />;
}
