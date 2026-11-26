import type { Metadata } from "next";
import { VideosList } from "@/components/console/modules/cms";

export const metadata: Metadata = { title: "Video Management" };

export default function Page() {
  return <VideosList />;
}
