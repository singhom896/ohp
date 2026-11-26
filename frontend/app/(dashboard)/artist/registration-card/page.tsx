import type { Metadata } from "next";
import { RegistrationCard } from "@/components/console/modules/workspace";

export const metadata: Metadata = { title: "Registration Card" };

export default function Page() {
  return <RegistrationCard />;
}