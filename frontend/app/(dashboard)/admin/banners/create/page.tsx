import type { Metadata } from "next";
import { BannersCreate } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Create Banner" };

export default function Page() {
  return <BannersCreate />;
}
