import type { Metadata } from "next";
import { CountriesList } from "@/components/console/modules/masters";

export const metadata: Metadata = { title: "Countries Management" };

export default function Page() {
  return <CountriesList />;
}
