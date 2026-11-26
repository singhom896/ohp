import type { Metadata } from "next";
import { ApplicationOverview } from "@/components/console/modules/applications";

export const metadata: Metadata = { title: "My Application" };

export default function Page() {
  return <ApplicationOverview />;
}
