import type { Metadata } from "next";
import LogsPage from "@/components/console/modules/logs";

export const metadata: Metadata = { title: "Login History" };

export default function Page() {
  return <LogsPage />;
}
