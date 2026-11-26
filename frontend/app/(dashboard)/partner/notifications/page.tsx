import type { Metadata } from "next";
import { Notifications } from "@/components/console/modules/workspace";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return <Notifications />;
}