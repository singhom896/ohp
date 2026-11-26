import type { Metadata } from "next";
import { ProfileUpdateReport } from "@/components/console/modules/applications";

export const metadata: Metadata = { title: "Update Requests Report" };

export default function Page() {
  return <ProfileUpdateReport />;
}
