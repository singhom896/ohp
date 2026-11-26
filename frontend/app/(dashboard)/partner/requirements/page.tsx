import type { Metadata } from "next";
import { RequirementList } from "@/components/console/modules/bookings";

export const metadata: Metadata = { title: "My Opportunities" };

export default function Page() {
  return <RequirementList />;
}