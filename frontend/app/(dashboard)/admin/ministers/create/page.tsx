import type { Metadata } from "next";
import { MinistersCreate } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Create Minister" };

export default function Page() {
  return <MinistersCreate />;
}
