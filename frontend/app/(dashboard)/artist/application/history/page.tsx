import type { Metadata } from "next";
import { ApplicationHistory } from "@/components/console/modules/applications";

export const metadata: Metadata = { title: "My Application - History" };

export default function Page() {
  return <ApplicationHistory />;
}
