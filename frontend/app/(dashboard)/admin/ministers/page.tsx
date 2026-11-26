import type { Metadata } from "next";
import { MinistersList } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Ministers Management" };

export default function Page() {
  return <MinistersList />;
}
