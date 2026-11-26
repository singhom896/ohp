import type { Metadata } from "next";
import { EventsList } from "@/components/console/modules/events";

export const metadata: Metadata = { title: "Event Management" };

export default function Page() {
  return <EventsList />;
}
