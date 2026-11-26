import type { Metadata } from "next";
import { EventsCreate } from "@/components/console/modules/events";

export const metadata: Metadata = { title: "Create Event" };

export default function Page() {
  return <EventsCreate />;
}
