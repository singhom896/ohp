import type { Metadata } from "next";
import { ApplicationDetails } from "@/components/console/modules/applications";

export const metadata: Metadata = { title: "My Application - Profile Details" };

export default function Page() {
  return <ApplicationDetails />;
}
