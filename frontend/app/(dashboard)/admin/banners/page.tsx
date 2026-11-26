import type { Metadata } from "next";
import { BannersList } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Banner Management" };

export default function Page() {
  return <BannersList />;
}
