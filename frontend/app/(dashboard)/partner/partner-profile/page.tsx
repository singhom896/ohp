import type { Metadata } from "next";
import { PartnerProfile } from "@/components/console/modules/partner";

export const metadata: Metadata = { title: "Organisation Profile" };

export default function Page() {
  return <PartnerProfile />;
}